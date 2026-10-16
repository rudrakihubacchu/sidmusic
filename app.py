import os
import sqlite3
import requests
from flask import Flask, render_template, request, jsonify, session, Response
from flask_socketio import SocketIO, emit, join_room
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "velvetsync-prod-secret-key-2026")

# Threading mode with simple-websocket for reliable Railway deployment
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

DB_PATH = os.path.join(os.path.dirname(__file__), "users.db")
active_rooms = {}


# ==============================================================================
# 1. SQLITE DATABASE FOR REAL LOGIN & REGISTRATION
# ==============================================================================
def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                avatar TEXT NOT NULL
            )
            """
        )
        conn.commit()


init_db()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    avatar = (data.get("avatar") or "").strip()

    if not name or not email or not password:
        return jsonify({"error": "Name, Email, and Password are required."}), 400

    if not avatar:
        avatar = f"https://api.dicebear.com/9.x/adventurer/svg?seed={requests.utils.quote(name)}"

    pw_hash = generate_password_hash(password)

    try:
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute(
                "INSERT INTO users (name, email, password_hash, avatar) VALUES (?, ?, ?, ?)",
                (name, email, pw_hash, avatar),
            )
            user_id = cur.lastrowid
            conn.commit()
    except sqlite3.IntegrityError:
        return jsonify({"error": "An account with this email already exists."}), 409

    user_data = {"id": user_id, "name": name, "email": email, "avatar": avatar}
    session["user"] = user_data
    return jsonify({"user": user_data})


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    with sqlite3.connect(DB_PATH) as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, name, email, password_hash, avatar FROM users WHERE email = ?",
            (email,),
        )
        row = cur.fetchone()

    if not row or not check_password_hash(row[3], password):
        return jsonify({"error": "Invalid email or password."}), 401

    user_data = {"id": row[0], "name": row[1], "email": row[2], "avatar": row[4]}
    session["user"] = user_data
    return jsonify({"user": user_data})


@app.route("/api/logout", methods=["POST"])
def logout():
    session.pop("user", None)
    return jsonify({"status": "logged_out"})


@app.route("/api/me", methods=["GET"])
def current_user():
    return jsonify({"user": session.get("user")})


# ==============================================================================
# 2. REAL HINDI & ENGLISH MUSIC API (JIOSAAVN + ITUNES FALLBACK)
# ==============================================================================
def fetch_from_saavn(query, limit=18):
    """Fetches full-length real Hindi/English songs from JioSaavn API."""
    tracks = []
    try:
        resp = requests.get(
            "https://saavn.dev/api/search/songs",
            params={"query": query, "limit": limit},
            timeout=6,
        )
        if resp.status_code == 200:
            results = resp.json().get("data", {}).get("results", [])
            for item in results:
                downloads = item.get("downloadUrl") or []
                if not downloads:
                    continue
                # Pick highest quality stream (320kbps or 160kbps)
                audio_url = downloads[-1].get("url")
                images = item.get("image") or []
                cover_url = images[-1].get("url") if images else ""
                artists = item.get("artists", {}).get("primary", [])
                artist_names = ", ".join([a.get("name", "") for a in artists]) or "Various Artists"
                lang = (item.get("language") or "hindi").lower()

                if audio_url:
                    tracks.append(
                        {
                            "id": f"saavn_{item.get('id')}",
                            "title": item.get("name", "Unknown Title").replace("&quot;", '"'),
                            "artist": artist_names,
                            "cover": cover_url,
                            "audioUrl": audio_url,
                            "language": "hindi" if lang in ["hindi", "punjabi", "urdu"] else "english",
                            "couple": True,
                            "duration": item.get("duration") or 210,
                        }
                    )
    except Exception:
        pass
    return tracks


def fetch_from_itunes(query, lang_tag="hindi", limit=15):
    """Reliable fallback using Apple iTunes Search API for real Hindi & English tracks."""
    tracks = []
    try:
        resp = requests.get(
            "https://itunes.apple.com/search",
            params={"term": query, "media": "music", "entity": "song", "limit": limit},
            timeout=6,
        )
        if resp.status_code == 200:
            for item in resp.json().get("results", []):
                preview_url = item.get("previewUrl")
                if not preview_url:
                    continue
                art = (item.get("artworkUrl100") or "").replace("100x100bb", "600x600bb")
                tracks.append(
                    {
                        "id": f"itunes_{item.get('trackId')}",
                        "title": item.get("trackName", "Unknown Track"),
                        "artist": item.get("artistName", "Unknown Artist"),
                        "cover": art,
                        "audioUrl": preview_url,
                        "language": lang_tag,
                        "couple": True,
                        "duration": int((item.get("trackTimeMillis") or 180000) / 1000),
                    }
                )
    except Exception:
        pass
    return tracks


@app.route("/api/songs")
def get_songs():
    query = (request.args.get("q") or "").strip()
    category = (request.args.get("category") or "all").lower()

    if query:
        songs = fetch_from_saavn(query, limit=24)
        if not songs:
            songs = fetch_from_itunes(query, lang_tag="all", limit=24)
        return jsonify({"songs": songs})

    # Default curated Real Hindi & English Romantic Hits
    if category == "hindi":
        songs = fetch_from_saavn("Arijit Singh Romantic Hindi Hits", limit=20)
        if not songs:
            songs = fetch_from_itunes("Arijit Singh Pritam Romantic Hindi", lang_tag="hindi", limit=20)
    elif category == "english":
        songs = fetch_from_saavn("The Weeknd Ed Sheeran Taylor Swift Romantic", limit=20)
        if not songs:
            songs = fetch_from_itunes("Ed Sheeran The Weeknd Taylor Swift Love", lang_tag="english", limit=20)
    else:
        hindi_hits = fetch_from_saavn("Arijit Singh Kesariya Tum Hi Ho Apna Bana Le", limit=12)
        if not hindi_hits:
            hindi_hits = fetch_from_itunes("Arijit Singh Shreya Ghoshal Romantic", lang_tag="hindi", limit=12)

        english_hits = fetch_from_saavn("Ed Sheeran Perfect Die With A Smile Until I Found You", limit=12)
        if not english_hits:
            english_hits = fetch_from_itunes("Bruno Mars The Weeknd Lana Del Rey", lang_tag="english", limit=12)

        songs = hindi_hits + english_hits

    return jsonify({"songs": songs})


@app.route("/api/download")
def download_audio():
    """Streams real song file to the user's device as a downloadable attachment."""
    url = request.args.get("url")
    title = request.args.get("title", "VelvetSync_Song").replace(" ", "_")
    if not url:
        return "Missing audio URL", 400

    try:
        r = requests.get(url, stream=True, timeout=15)
        ext = "m4a" if ".m4a" in url or ".mp4" in url else "mp3"
        headers = {
            "Content-Disposition": f'attachment; filename="{title}.{ext}"',
            "Content-Type": r.headers.get("Content-Type", "audio/mpeg"),
        }
        return Response(r.iter_content(chunk_size=8192), headers=headers)
    except Exception as e:
        return str(e), 500


# ==============================================================================
# 3. REAL-TIME DUO & TRIO WEBSOCKET SYNCHRONIZATION
# ==============================================================================
@socketio.on("join_sync_room")
def handle_join(data):
    room = data.get("room")
    mode = data.get("mode", "duo")
    user = data.get("user") or {"name": "Listener", "avatar": ""}

    if not room:
        return

    join_room(room)
    if room not in active_rooms:
        active_rooms[room] = {"mode": mode, "members": []}

    existing_names = [m["name"] for m in active_rooms[room]["members"]]
    if user["name"] not in existing_names:
        active_rooms[room]["members"].append(user)

    emit(
        "room_joined",
        {
            "room": room,
            "mode": mode,
            "members": active_rooms[room]["members"],
        },
        to=room,
    )


@socketio.on("sync_action")
def handle_sync_action(data):
    room = data.get("room")
    if room:
        emit("sync_update", data, to=room, include_self=False)


@socketio.on("send_chat")
def handle_chat(data):
    room = data.get("room")
    if room:
        emit("receive_chat", data, to=room)


@socketio.on("send_reaction")
def handle_reaction(data):
    room = data.get("room")
    if room:
        emit("receive_reaction", data, to=room)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, allow_unsafe_werkzeug=True)
