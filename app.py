from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room

app = Flask(__name__)
app.config["SECRET_KEY"] = "velvetsync-secret"
socketio = SocketIO(app, cors_allowed_origins="*")

@app.route("/")
def index():
    return render_template("index.html")

@socketio.on("join_sync_room")
def handle_join(data):
    room = data.get("room")
    mode = data.get("mode", "duo")
    join_room(room)
    emit("room_status", {"room": room, "mode": mode, "status": "Partner Connected"}, to=room)

@socketio.on("sync_action")
def handle_sync_action(data):
    room = data.get("room")
    emit("sync_update", data, to=room, include_self=False)

if __name__ == "__main__":
    socketio.run(app, host="0.0.0.0", port=5000, debug=True)
