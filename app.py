import os
from flask import Flask, render_template, jsonify
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "velvetsync-railway-secret-2026")

# Threading mode with simple-websocket for full Railway compatibility
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# In-memory room tracker for active Duo/Trio sessions
active_rooms = {}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    return jsonify({"status": "ok", "active_rooms": len(active_rooms)})


@socketio.on("join_sync_room")
def handle_join(data):
    room = data.get("room")
    mode = data.get("mode", "duo")
    username = data.get("username", "Akshu")

    if not room:
        return

    join_room(room)
    if room not in active_rooms:
        active_rooms[room] = {"mode": mode, "members": []}

    if username not in active_rooms[room]["members"]:
        active_rooms[room]["members"].append(username)

    emit(
        "room_joined",
        {
            "room": room,
            "mode": mode,
            "username": username,
            "members": active_rooms[room]["members"],
        },
        to=room,
    )


@socketio.on("sync_action")
def handle_sync_action(data):
    """Broadcasts PLAY, PAUSE, SEEK, WALLPAPER, THEME, and FX changes to the room."""
    room = data.get("room")
    if room:
        emit("sync_update", data, to=room, include_self=False)


@socketio.on("send_chat")
def handle_chat(data):
    """Broadcasts real-time couple/trio chat messages."""
    room = data.get("room")
    if room:
        emit("receive_chat", data, to=room)


@socketio.on("send_reaction")
def handle_reaction(data):
    """Broadcasts floating heart/sakura/emoji animations to all devices in room."""
    room = data.get("room")
    if room:
        emit("receive_reaction", data, to=room)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, allow_unsafe_werkzeug=True)
