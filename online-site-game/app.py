import os
import sys
import random
import string

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

from flask import Flask, render_template, request, session
from flask_socketio import SocketIO, emit, join_room, leave_room

app = Flask(__name__)
app.config['SECRET_KEY'] = 'ocean-secret-key-2026'
# Windows 및 Python 3.12에서 가장 안정적인 threading 모드 사용
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

# In-memory storage for rooms and active users
# rooms = {
#     room_code: {
#         "code": str (10-digit number),
#         "host_sid": str,
#         "max_players": int,
#         "is_playing": bool,
#         "players": {
#             sid: {
#                 "sid": str,
#                 "name": str,
#                 "is_ready": bool,
#                 "is_host": bool,
#                 "avatar": str
#             }
#         },
#         "messages": list
#     }
# }
rooms = {}
users = {} # sid -> {"name": str, "room_code": str or None, "avatar": str}

AVATARS = ["🐬", "🐢", "🐙", "🐋", "🦈", "🦀", "🐠", "🐡", "🦭", "🐧"]

def generate_10_digit_code():
    """10자리 무작위 숫자 코드를 생성합니다 (앞자리는 1~9)."""
    while True:
        code = str(random.randint(1000000000, 9999999999))
        if code not in rooms:
            return code

def get_room_state(room_code):
    """클라이언트에 전달할 방 상태 데이터를 패키징합니다."""
    room = rooms.get(room_code)
    if not room:
        return None
    
    player_list = []
    for sid, p in room["players"].items():
        player_list.append({
            "sid": sid,
            "name": p["name"],
            "is_ready": p["is_ready"],
            "is_host": p["is_host"],
            "avatar": p.get("avatar", "🐟"),
            "x": p.get("x", 12150),
            "y": p.get("y", 12150),
            "angle": p.get("angle", 0),
            "zone": p.get("zone", "구역 5 [5-5]")
        })

    # 방장을 목록 최상단에 배치
    player_list.sort(key=lambda x: (not x["is_host"], x["name"]))

    return {
        "code": room["code"],
        "host_sid": room["host_sid"],
        "max_players": room["max_players"],
        "current_players": len(player_list),
        "is_playing": room["is_playing"],
        "players": player_list
    }

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    sid = request.sid
    # 초기 유저 프로필 등록
    default_name = f"참치_{random.randint(100, 999)}"
    default_avatar = "🐟"
    users[sid] = {
        "name": default_name,
        "avatar": default_avatar,
        "room_code": None
    }
    emit('init_user', {
        "sid": sid,
        "name": default_name,
        "avatar": default_avatar
    })
    print(f"[Connect] User connected: {sid} ({default_name})")

@socketio.on('update_profile')
def handle_update_profile(data):
    sid = request.sid
    new_name = str(data.get('name', '')).strip()
    new_avatar = data.get('avatar')
    
    if not new_name:
        new_name = f"탐험가_{random.randint(100, 999)}"
    new_name = new_name[:16] # 최대 16자 제한

    if sid in users:
        users[sid]["name"] = new_name
        if new_avatar in AVATARS:
            users[sid]["avatar"] = new_avatar
            
        current_room = users[sid].get("room_code")
        if current_room and current_room in rooms:
            if sid in rooms[current_room]["players"]:
                rooms[current_room]["players"][sid]["name"] = new_name
                if new_avatar in AVATARS:
                    rooms[current_room]["players"][sid]["avatar"] = new_avatar
                socketio.emit('room_state_update', get_room_state(current_room), to=current_room)

    emit('profile_updated', {
        "name": users[sid]["name"],
        "avatar": users[sid]["avatar"]
    })

@socketio.on('create_room')
def handle_create_room():
    sid = request.sid
    user_info = users.get(sid, {
        "name": f"탐험가_{random.randint(100, 999)}",
        "avatar": "🐬"
    })
    
    # 이미 참여 중인 방이 있다면 먼저 퇴장 처리
    old_room = user_info.get("room_code")
    if old_room and old_room in rooms:
        internal_leave_room(sid, old_room)

    # 10자리 숫자 랜덤 코드 생성
    room_code = generate_10_digit_code()
    
    rooms[room_code] = {
        "code": room_code,
        "host_sid": sid,
        "max_players": 4, # 기본 4명
        "is_playing": False,
        "players": {
            sid: {
                "sid": sid,
                "name": user_info["name"],
                "is_ready": False, # 방장도 준비완료를 눌러야 시작 가능
                "is_host": True,
                "avatar": user_info.get("avatar", "🐟"),
                "x": 12150,
                "y": 12150,
                "angle": 0,
                "zone": "구역 5 [5-5]"
            }
        },
        "messages": []
    }
    
    users[sid]["room_code"] = room_code
    join_room(room_code)
    
    state = get_room_state(room_code)
    emit('room_joined', {"success": True, "room": state, "is_host": True, "sid": sid})
    print(f"[Create Room] Created 10-digit room: {room_code} by {user_info['name']}")

@socketio.on('join_room')
def handle_join_room(data):
    sid = request.sid
    room_code = str(data.get('code', '')).strip()
    
    # 10자리 숫자 검증
    if not (len(room_code) == 10 and room_code.isdigit()):
        emit('join_error', {"message": "방 코드는 10자리 숫자여야 합니다."})
        return

    if room_code not in rooms:
        emit('join_error', {"message": "존재하지 않는 방 코드입니다."})
        return

    room = rooms[room_code]

    if room["is_playing"]:
        emit('join_error', {"message": "이미 게임이 진행 중인 방입니다."})
        return

    if len(room["players"]) >= room["max_players"]:
        emit('join_error', {"message": f"방 인원이 가득 찼습니다. (최대 {room['max_players']}명)"})
        return

    user_info = users.get(sid, {
        "name": f"탐험가_{random.randint(100, 999)}",
        "avatar": "🐬"
    })

    # 이미 다른 방에 있었다면 퇴장 처리
    old_room = user_info.get("room_code")
    if old_room and old_room in rooms:
        internal_leave_room(sid, old_room)

    users[sid]["room_code"] = room_code
    room["players"][sid] = {
        "sid": sid,
        "name": user_info["name"],
        "is_ready": False, # 참가자는 기본 준비중
        "is_host": False,
        "avatar": user_info.get("avatar", "🐟"),
        "x": 12150 + random.randint(-150, 150),
        "y": 12150 + random.randint(-150, 150),
        "angle": 0,
        "zone": "구역 5 [5-5]"
    }
    
    join_room(room_code)
    
    state = get_room_state(room_code)
    emit('room_joined', {"success": True, "room": state, "is_host": False, "sid": sid})
    socketio.emit('room_state_update', state, to=room_code)
    socketio.emit('chat_message', {
        "system": True,
        "text": f"🌊 {user_info['name']} 님이 입장하셨습니다."
    }, to=room_code)
    print(f"[Join Room] {user_info['name']} joined room {room_code}")

@socketio.on('toggle_ready')
def handle_toggle_ready():
    sid = request.sid
    room_code = users.get(sid, {}).get("room_code")
    
    if not room_code or room_code not in rooms:
        return
        
    room = rooms[room_code]
    if sid in room["players"]:
        current_status = room["players"][sid]["is_ready"]
        room["players"][sid]["is_ready"] = not current_status
        socketio.emit('room_state_update', get_room_state(room_code), to=room_code)

@socketio.on('set_max_players')
def handle_set_max_players(data):
    sid = request.sid
    room_code = users.get(sid, {}).get("room_code")
    
    if not room_code or room_code not in rooms:
        return
        
    room = rooms[room_code]
    # 방장만 변경 가능
    if room["host_sid"] != sid:
        emit('action_error', {"message": "플레이 인원 설정은 방장만 가능합니다."})
        return
        
    try:
        new_max = int(data.get('max_players', 4))
    except (ValueError, TypeError):
        return

    if new_max < len(room["players"]):
        emit('action_error', {"message": f"현재 참가 인원({len(room['players'])}명)보다 적게 설정할 수 없습니다."})
        return

    if 2 <= new_max <= 8:
        room["max_players"] = new_max
        socketio.emit('room_state_update', get_room_state(room_code), to=room_code)
        socketio.emit('chat_message', {
            "system": True,
            "text": f"⚙️ 방장이 최대 플레이 인원을 {new_max}명으로 변경했습니다."
        }, to=room_code)

@socketio.on('kick_player')
def handle_kick_player(data):
    sid = request.sid
    target_sid = data.get('target_sid')
    room_code = users.get(sid, {}).get("room_code")
    
    if not room_code or room_code not in rooms:
        return
        
    room = rooms[room_code]
    # 방장만 강퇴 가능
    if room["host_sid"] != sid:
        emit('action_error', {"message": "강퇴 권한은 방장에게만 있습니다."})
        return

    if target_sid == sid:
        emit('action_error', {"message": "자기 자신을 강퇴할 수 없습니다."})
        return

    if target_sid in room["players"]:
        target_name = room["players"][target_sid]["name"]
        
        # 대상 유저에게 강퇴 통보
        socketio.emit('kicked', {
            "message": "방장에 의해 대기실에서 강퇴되었습니다."
        }, to=target_sid)
        
        # 퇴장 처리
        internal_leave_room(target_sid, room_code)
        
        # 남은 유저들에게 알림 및 상태 갱신
        socketio.emit('chat_message', {
            "system": True,
            "text": f"🚫 {target_name} 님이 강퇴되었습니다."
        }, to=room_code)
        socketio.emit('room_state_update', get_room_state(room_code), to=room_code)

@socketio.on('leave_room')
def handle_leave_room():
    sid = request.sid
    room_code = users.get(sid, {}).get("room_code")
    if room_code:
        internal_leave_room(sid, room_code)
        emit('left_room_success')

@socketio.on('move_zone')
def handle_move_zone(data):
    sid = request.sid
    room_code = users.get(sid, {}).get("room_code")
    if not room_code or room_code not in rooms:
        return

    new_zone = str(data.get('zone', 'center'))
    valid_zones = ['top_left', 'top', 'top_right', 'left', 'center', 'right', 'bottom_left', 'bottom', 'bottom_right']
    if new_zone not in valid_zones:
        return

    room = rooms[room_code]
    if sid in room["players"]:
        room["players"][sid]["zone"] = new_zone
        socketio.emit('zone_moved', {
            "sid": sid,
            "name": room["players"][sid]["name"],
            "zone": new_zone,
            "players": list(room["players"].values())
        }, to=room_code)

@socketio.on('player_pos_update')
def handle_player_pos_update(data):
    sid = request.sid
    room_code = users.get(sid, {}).get("room_code")
    if not room_code or room_code not in rooms:
        return
        
    room = rooms[room_code]
    if sid in room["players"]:
        p = room["players"][sid]
        try:
            p["x"] = float(data.get("x", 12150))
            p["y"] = float(data.get("y", 12150))
            p["angle"] = float(data.get("angle", 0))
            p["zone"] = str(data.get("zone", "구역 5 [5-5]"))
            emit('other_player_pos', {
                "sid": sid,
                "x": p["x"],
                "y": p["y"],
                "angle": p["angle"],
                "zone": p["zone"],
                "name": p["name"],
                "avatar": p.get("avatar", "🐟")
            }, to=room_code, include_self=False)
        except (ValueError, TypeError):
            pass

@socketio.on('start_game')
def handle_start_game():
    sid = request.sid
    room_code = users.get(sid, {}).get("room_code")
    
    if not room_code or room_code not in rooms:
        return
        
    room = rooms[room_code]
    if room["host_sid"] != sid:
        emit('action_error', {"message": "게임 시작은 방장만 가능합니다."})
        return

    # 대기실 내 모든 플레이어가 준비완료 상태인지 엄격하게 검증
    unready_players = [p["name"] for s, p in room["players"].items() if not p.get("is_ready", False)]
    
    if unready_players:
        emit('action_error', {
            "message": f"아직 준비를 마치지 않은 플레이어가 있습니다: {', '.join(unready_players)}"
        })
        return

    room["is_playing"] = True
    socketio.emit('game_started', {
        "room_code": room_code,
        "players": list(room["players"].values())
    }, to=room_code)
    print(f"[Start Game] Game successfully started in room {room_code}")

@socketio.on('send_chat')
def handle_send_chat(data):
    sid = request.sid
    room_code = users.get(sid, {}).get("room_code")
    if not room_code or room_code not in rooms:
        return

    msg = str(data.get('message', '')).strip()
    if not msg:
        return

    user_info = users.get(sid, {"name": "게스트", "avatar": "🐬"})
    socketio.emit('chat_message', {
        "system": False,
        "sender": user_info["name"],
        "avatar": user_info.get("avatar", "🐬"),
        "text": msg[:100],
        "is_me": False,
        "sender_sid": sid
    }, to=room_code)

def internal_leave_room(sid, room_code):
    """소켓 세션을 해당 방에서 안전하게 제거하고 방장 인계 혹은 방을 정리합니다."""
    if room_code not in rooms:
        return

    room = rooms[room_code]
    player_info = room["players"].pop(sid, None)
    leave_room(room_code, sid=sid)
    
    if sid in users:
        users[sid]["room_code"] = None

    player_name = player_info["name"] if player_info else "플레이어"

    if len(room["players"]) == 0:
        # 방에 아무도 없으면 삭제
        del rooms[room_code]
        print(f"[Room Closed] Room {room_code} has been deleted.")
    else:
        # 방장이 나갔다면 다음 사람에게 방장 위임
        if room["host_sid"] == sid:
            next_host_sid = next(iter(room["players"]))
            room["host_sid"] = next_host_sid
            room["players"][next_host_sid]["is_host"] = True
            room["players"][next_host_sid]["is_ready"] = True
            socketio.emit('chat_message', {
                "system": True,
                "text": f"👑 {player_name} 님이 퇴장하여 {room['players'][next_host_sid]['name']} 님이 새로운 방장이 되었습니다."
            }, to=room_code)
        else:
            socketio.emit('chat_message', {
                "system": True,
                "text": f"👋 {player_name} 님이 퇴장하셨습니다."
            }, to=room_code)

        socketio.emit('room_state_update', get_room_state(room_code), to=room_code)

@socketio.on('disconnect')
def handle_disconnect():
    sid = request.sid
    room_code = users.get(sid, {}).get("room_code")
    if room_code and room_code in rooms:
        internal_leave_room(sid, room_code)
    users.pop(sid, None)
    print(f"[Disconnect] User disconnected: {sid}")

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    print("==================================================")
    print("War Of Tuna Game Server Started!")
    print(f"URL: http://localhost:{port}")
    print("==================================================")
    socketio.run(app, host='0.0.0.0', port=port, debug=False, allow_unsafe_werkzeug=True)
