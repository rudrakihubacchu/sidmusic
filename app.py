import os
import json
import time
import base64
import sqlite3
import html
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
import requests
from requests.adapters import HTTPAdapter
import yt_dlp
from pyDes import des, ECB, PAD_PKCS5
from flask import Flask, render_template, request, jsonify, session, Response, redirect
from flask_socketio import SocketIO, emit, join_room
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "velvetsync-fullsong-secret-2026")

socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

DB_PATH = os.path.join(os.path.dirname(__file__), "users.db")
active_rooms = {}

# High-Speed Persistent Connection Pool (keeps sockets open for instant API responses)
http_session = requests.Session()
adapter = HTTPAdapter(pool_connections=30, pool_maxsize=30, max_retries=1)
http_session.mount("https://", adapter)
http_session.mount("http://", adapter)
http_session.headers.update(
    {
        "User-Agent": (
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) "
            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
    }
)

DES_CIPHER = des(b"38346591", ECB, b"\0\0\0\0\0\0\0\0", pad=None, padmode=PAD_PKCS5)

# Tier-1 RAM Cache: { "cache_key": (timestamp, songs_list) }
MEMORY_CACHE = {}
CACHE_TTL = 3600  # 1 hour fresh window (serves stale instantly while refreshing in background)
REFRESH_IN_PROGRESS = set()
bg_executor = ThreadPoolExecutor(max_workers=8)


# ==============================================================================
# 1. SQLITE DATABASE (USERS + PERSISTENT INSTANT SONG CACHE)
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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS song_cache (
                cache_key TEXT PRIMARY KEY,
                updated_at REAL NOT NULL,
                payload TEXT NOT NULL
            )
            """
        )
        conn.commit()


def load_disk_cache_into_ram():
    """Loads previously cached songs from SQLite into RAM on server boot (< 5ms)."""
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cur = conn.cursor()
            cur.execute("SELECT cache_key, updated_at, payload FROM song_cache")
            for key, updated_at, payload in cur.fetchall():
                MEMORY_CACHE[key] = (updated_at, json.loads(payload))
    except Exception as e:
        print("Cache preload note:", e)


def save_to_cache(cache_key, songs_list):
    """Saves songs to both Tier-1 RAM and Tier-2 SQLite disk cache."""
    if not songs_list:
        return
    now = time.time()
    MEMORY_CACHE[cache_key] = (now, songs_list)
    try:
        with sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                "INSERT OR REPLACE INTO song_cache (cache_key, updated_at, payload) VALUES (?, ?, ?)",
                (cache_key, now, json.dumps(songs_list)),
            )
            conn.commit()
    except Exception:
        pass


init_db()
load_disk_cache_into_ram()


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
# 2. ULTRA-FAST FULL-SONG ENGINE (DIRECT 320KBPS + MIRROR + STALE-WHILE-REVALIDATE)
# ==============================================================================
def decrypt_full_stream_url(enc_url, is_320=True):
    if not enc_url:
        return None
    try:
        enc_bytes = base64.b64decode(enc_url.strip())
        dec_url = DES_CIPHER.decrypt(enc_bytes, padmode=PAD_PKCS5).decode("utf-8")
        if is_320:
            dec_url = dec_url.replace("_96.mp4", "_320.mp4").replace("_160.mp4", "_320.mp4")
        else:
            dec_url = dec_url.replace("_96.mp4", "_160.mp4")
        return dec_url
    except Exception:
        return None


def fetch_official_full_songs(query, page=1, limit=24):
    """Primary fast 320kbps full-song fetcher with strict 2.5s timeout."""
    tracks = []
    try:
        resp = http_session.get(
            "https://www.jiosaavn.com/api.php",
            params={
                "__call": "search.getResults",
                "_format": "json",
                "_marker": "0",
                "api_version": "4",
                "ctx": "web6dot0",
                "n": limit,
                "p": page,
                "q": query,
            },
            timeout=2.5,
        )
        if resp.status_code == 200:
            results = resp.json().get("results") or []
            for item in results:
                more = item.get("more_info") or {}
                enc_url = more.get("encrypted_media_url")
                has_320 = str(more.get("320kbps", "true")).lower() == "true"
                stream_url = decrypt_full_stream_url(enc_url, has_320)
                if not stream_url:
                    continue

                duration_sec = int(more.get("duration") or 210)
                if duration_sec < 60:
                    continue

                raw_title = html.unescape(item.get("title") or item.get("song") or "Unknown Track")
                artist_map = more.get("artistMap") or {}
                primary_artists = artist_map.get("primary_artists") or []
                artist_names = ", ".join(
                    [html.unescape(a.get("name", "")) for a in primary_artists if a.get("name")]
                )
                if not artist_names:
                    artist_names = html.unescape(item.get("subtitle") or "Various Artists")

                cover = (item.get("image") or "").replace("150x150", "500x500").replace("50x50", "500x500")
                lang = (item.get("language") or "music").capitalize()

                tracks.append(
                    {
                        "id": f"saavn_{item.get('id')}",
                        "title": raw_title,
                        "artist": artist_names,
                        "cover": cover,
                        "audioUrl": stream_url,
                        "language": lang,
                        "duration": duration_sec,
                        "couple": True,
                    }
                )
    except Exception:
        pass

    # Fast Mirror Fallback if Railway datacenter IP is throttled by primary endpoint
    if not tracks:
        try:
            resp = http_session.get(
                "https://saavn.dev/api/search/songs",
                params={"query": query, "page": page, "limit": limit},
                timeout=2.5,
            )
            if resp.status_code == 200:
                for item in resp.json().get("data", {}).get("results", []):
                    downloads = item.get("downloadUrl") or []
                    if not downloads:
                        continue
                    duration_sec = int(item.get("duration") or 210)
                    if duration_sec < 60:
                        continue
                    audio_url = downloads[-1].get("url")
                    images = item.get("image") or []
                    cover_url = images[-1].get("url") if images else ""
                    artists = item.get("artists", {}).get("primary", [])
                    artist_names = ", ".join([a.get("name", "") for a in artists]) or "Various Artists"
                    if audio_url:
                        tracks.append(
                            {
                                "id": f"saavn_{item.get('id')}",
                                "title": html.unescape(item.get("name", "Unknown Track")),
                                "artist": html.unescape(artist_names),
                                "cover": cover_url,
                                "audioUrl": audio_url,
                                "language": (item.get("language") or "Music").capitalize(),
                                "duration": duration_sec,
                                "couple": True,
                            }
                        )
        except Exception:
            pass

    return tracks


def fetch_youtube_full_songs(query, limit=12):
    tracks = []
    ydl_opts = {
        "quiet": True,
        "extract_flat": True,
        "skip_download": True,
        "noplaylist": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"ytsearch{limit}:{query} official audio", download=False)
            for entry in info.get("entries") or []:
                vid_id = entry.get("id")
                duration = int(entry.get("duration") or 200)
                if not vid_id or duration < 60 or duration > 900:
                    continue
                thumbs = entry.get("thumbnails") or []
                cover = thumbs[-1].get("url") if thumbs else f"https://i.ytimg.com/vi/{vid_id}/hqdefault.jpg"
                tracks.append(
                    {
                        "id": f"yt_{vid_id}",
                        "title": entry.get("title") or "Unknown Track",
                        "artist": entry.get("uploader") or entry.get("channel") or "Global Artist",
                        "cover": cover,
                        "audioUrl": f"/api/yt_stream/{vid_id}",
                        "language": "Global",
                        "duration": duration,
                        "couple": True,
                    }
                )
    except Exception as e:
        print("yt-dlp search error:", e)
    return tracks


@app.route("/api/yt_stream/<video_id>")
def stream_youtube_audio(video_id):
    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio/best",
        "quiet": True,
        "noplaylist": True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://www.youtube.com/watch?v={video_id}", download=False)
            direct_url = info.get("url")
            if direct_url:
                return redirect(direct_url)
    except Exception as e:
        return str(e), 500
    return "Stream unavailable", 404


CATEGORY_QUERIES = {
    "all": ["Arijit Singh Romantic Hits", "The Weeknd Ed Sheeran Hits"],
    "hindi": ["Arijit Singh Shreya Ghoshal Romantic Hits", "Atif Aslam Pritam Hits"],
    "english": ["The Weeknd Bruno Mars Ed Sheeran", "Taylor Swift Billie Eilish Lana Del Rey"],
    "punjabi": ["Diljit Dosanjh Karan Aujla AP Dhillon", "Shubh Guru Randhawa"],
    "marathi": ["Ajay Atul Marathi Romantic Hits", "Sonu Nigam Shreya Ghoshal Marathi"],
    "lofi": ["Hindi Lofi Slowed Reverb Romantic", "Bollywood Chill Lofi"],
    "party": ["Bollywood Party Hits Badshah", "Global Club Hits Dua Lipa"],
}


def refresh_category_now(category, page=1):
    """Fetches a category in parallel and updates RAM + SQLite cache."""
    cache_key = f"cat:{category}:{page}"
    if cache_key in REFRESH_IN_PROGRESS:
        return MEMORY_CACHE.get(cache_key, (0, []))[1]

    REFRESH_IN_PROGRESS.add(cache_key)
    try:
        queries = CATEGORY_QUERIES.get(category, CATEGORY_QUERIES["all"])
        seen_ids = set()
        combined_songs = []

        futures = [bg_executor.submit(fetch_official_full_songs, q, page, 16) for q in queries]
        for fut in as_completed(futures):
            for track in fut.result():
                if track["id"] not in seen_ids:
                    seen_ids.add(track["id"])
                    combined_songs.append(track)

        if combined_songs:
            save_to_cache(cache_key, combined_songs)
        return combined_songs
    finally:
        REFRESH_IN_PROGRESS.discard(cache_key)


def get_instant_category(category, page=1):
    """
    Returns cached songs in < 1ms if available.
    If cache is older than CACHE_TTL, returns cached songs immediately
    and triggers a non-blocking background refresh (Stale-While-Revalidate).
    """
    cache_key = f"cat:{category}:{page}"
    now = time.time()

    if cache_key in MEMORY_CACHE:
        saved_time, cached_list = MEMORY_CACHE[cache_key]
        if now - saved_time > CACHE_TTL:
            bg_executor.submit(refresh_category_now, category, page)
        return cached_list

    return refresh_category_now(category, page)


def prewarm_all_categories():
    """Pre-loads all 7 categories into RAM + SQLite immediately on server boot."""
    for cat in CATEGORY_QUERIES.keys():
        if f"cat:{cat}:1" not in MEMORY_CACHE:
            refresh_category_now(cat, 1)


threading.Thread(target=prewarm_all_categories, daemon=True).start()


@app.route("/api/songs")
def get_songs():
    query = (request.args.get("q") or "").strip()
    category = (request.args.get("category") or "all").lower()
    page = int(request.args.get("page") or 1)
    source = (request.args.get("source") or "auto").lower()

    if query:
        cache_key = f"q:{query.lower()}:{page}:{source}"
        if cache_key in MEMORY_CACHE:
            return jsonify({"songs": MEMORY_CACHE[cache_key][1], "page": page})

        if source == "youtube":
            songs = fetch_youtube_full_songs(query, limit=14)
        else:
            songs = fetch_official_full_songs(query, page=page, limit=26)
            # Only fall back to yt-dlp if zero standard tracks were found
            if not songs and page == 1:
                songs = fetch_youtube_full_songs(query, limit=10)

        if songs:
            save_to_cache(cache_key, songs)
        return jsonify({"songs": songs, "page": page})

    combined_songs = get_instant_category(category, page=page)
    return jsonify({"songs": combined_songs, "page": page})


@app.route("/api/download")
def download_audio():
    url = request.args.get("url")
    title = request.args.get("title", "VelvetSync_Full_Song").replace(" ", "_")
    if not url:
        return "Missing audio URL", 400

    try:
        if url.startswith("/api/yt_stream/"):
            vid_id = url.split("/")[-1]
            ydl_opts = {"format": "bestaudio[ext=m4a]/bestaudio/best", "quiet": True}
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(f"https://www.youtube.com/watch?v={vid_id}", download=False)
                url = info.get("url")

        r = http_session.get(url, stream=True, timeout=20)
        ext = "m4a" if ".mp4" in url or ".m4a" in url else "mp3"
        headers = {
            "Content-Disposition": f'attachment; filename="{title}.{ext}"',
            "Content-Type": r.headers.get("Content-Type", "audio/mp4"),
        }
        return Response(r.iter_content(chunk_size=16384), headers=headers)
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
