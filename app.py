import os
from flask import Flask, render_template
from flask_socketio import SocketIO, emit, join_room

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "velvetsync-secret-key")

# Threading mode + simple-websocket works reliably on Railway
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

@app.route("/")
def index():
    return render_template("index.html")

@socketio.on("join_sync_room")
def handle_join(data):
    room = data.get("room")
    mode = data.get("mode", "duo")
    if room:
        join_room(room)
        emit(
            "room_joined",
            {"room": room, "mode": mode},
            to=room,
            include_self=False
        )

@socketio.on("sync_action")
def handle_sync_action(data):
    room = data.get("room")
    if room:
        # Broadcast Play, Pause, or Seek to everyone else in the Duo/Trio room
        emit("sync_update", data, to=room, include_self=False)

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    socketio.run(app, host="0.0.0.0", port=port, allow_unsafe_werkzeug=True)
