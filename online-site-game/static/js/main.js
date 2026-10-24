/**
 * OCEAN ONLINE - Real-time Game Lobby System
 */

// ======================= 1. 전역 상태 및 Socket 초기화 =======================
let socket = null;

let savedNick = localStorage.getItem('ocean_nickname');
if (savedNick === '오토코노코') {
    localStorage.removeItem('ocean_nickname');
    savedNick = '';
}

const state = {
    mySid: null,
    myName: savedNick || '',
    myAvatar: localStorage.getItem('ocean_avatar') || '🐟',
    isHost: false,
    currentRoom: null,
    soundEnabled: true,
    connected: false,
    myZone: 'center'
};

const ZONE_NAMES = {
    top_left: '상좌 (빙하 해역)',
    top: '상 (북방 대해)',
    top_right: '상우 (화산 암초)',
    left: '좌 (해초 숲)',
    center: '가운데 (메인 격전지)',
    right: '우 (난파선 해역)',
    bottom_left: '하좌 (산호초 미로)',
    bottom: '하 (심해 해구)',
    bottom_right: '하우 (소용돌이)'
};

const COORD_TO_ZONE = [
    ['top_left', 'top', 'top_right'],
    ['left', 'center', 'right'],
    ['bottom_left', 'bottom', 'bottom_right']
];

const ZONE_TO_COORD = {
    top_left: [0, 0], top: [0, 1], top_right: [0, 2],
    left: [1, 0],     center: [1, 1], right: [1, 2],
    bottom_left: [2, 0], bottom: [2, 1], bottom_right: [2, 2]
};

const AVATARS = ["🐬", "🐢", "🐙", "🐋", "🦈", "🦀", "🐠", "🐡", "🦭", "🐧"];

// DOM 요소 참조
const bgMain = document.getElementById('bg-main');
const bgRoom = document.getElementById('bg-room');

const screenMain = document.getElementById('screen-main');
const screenRoom = document.getElementById('screen-room');
const screenGame = document.getElementById('screen-game');

// 메인 화면 요소
const nicknameInput = document.getElementById('nickname-input');
const saveNameBtn = document.getElementById('save-name-btn');
const myAvatarEl = document.getElementById('my-avatar');
const avatarBtn = document.getElementById('avatar-btn');
const soundToggleBtn = document.getElementById('sound-toggle-btn');
const serverStatusPill = document.getElementById('server-status-pill');
const createRoomBtn = document.getElementById('create-room-btn');
const joinRoomBtn = document.getElementById('join-room-btn');
const joinCodeInput = document.getElementById('join-code-input');
const codeCounter = document.getElementById('code-counter');

// 대기실 요소
const displayRoomCode = document.getElementById('display-room-code');
const copyCodeBtn = document.getElementById('copy-code-btn');
const playerCountText = document.getElementById('player-count-text');
const hostBanner = document.getElementById('host-banner');
const maxPlayersSelect = document.getElementById('max-players-select');
const capsuleSlotsContainer = document.getElementById('capsule-slots-container');
const allReadyIndicator = document.getElementById('all-ready-indicator');
const toggleReadyBtn = document.getElementById('toggle-ready-btn');
const startGameBtn = document.getElementById('start-game-btn');
const quickStartGameBtn = document.getElementById('quick-start-game-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

// 채팅 요소
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const chatSendBtn = document.getElementById('chat-send-btn');

// 모달 요소
const avatarModal = document.getElementById('avatar-modal');
const avatarGrid = document.getElementById('avatar-grid');
const closeAvatarModal = document.getElementById('close-avatar-modal');

// 커스텀 다이얼로그 모달 요소
const customDialogModal = document.getElementById('custom-dialog-modal');
const dialogIcon = document.getElementById('dialog-icon');
const dialogTitle = document.getElementById('dialog-title');
const dialogDesc = document.getElementById('dialog-desc');
const dialogSub = document.getElementById('dialog-sub');
const dialogCancelBtn = document.getElementById('dialog-cancel-btn');
const dialogConfirmBtn = document.getElementById('dialog-confirm-btn');

// 게임 스테이지 요소
const gameStageRoomCode = document.getElementById('game-stage-room-code');
const currentZoneName = document.getElementById('current-zone-name');
const backToLobbyBtn = document.getElementById('back-to-lobby-btn');
const zoneCells = document.querySelectorAll('.zone-cell');
const navButtons = document.querySelectorAll('.nav-btn');

// ======================= 2. 웹 오디오 API 효과음 합성 =======================
let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playSound(type) {
    if (!state.soundEnabled) return;
    try {
        initAudio();
        const now = audioCtx.currentTime;

        if (type === 'click') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.exponentialRampToValueAtTime(1000, now + 0.08);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.08);
        } else if (type === 'ready') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(440, now);
            osc.frequency.setValueAtTime(880, now + 0.1);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.25);
        } else if (type === 'join') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(350, now);
            osc.frequency.exponentialRampToValueAtTime(700, now + 0.15);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'play') {
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.type = 'square';
                osc.frequency.setValueAtTime(freq, now + i * 0.08);
                gain.gain.setValueAtTime(0.12, now + i * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.2);
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.start(now + i * 0.08);
                osc.stop(now + i * 0.08 + 0.25);
            });
        } else if (type === 'kick') {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(260, now);
            osc.frequency.exponentialRampToValueAtTime(90, now + 0.2);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start(now);
            osc.stop(now + 0.2);
        }
    } catch (e) {
        // AudioContext 오류 무시
    }
}

// ======================= 3. 알림 토스트 UI =======================
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let icon = '🌊';
    if (type === 'error') icon = '⚠️';
    if (type === 'success') icon = '✨';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
    }, 3200);
}

// ======================= 4. 화면 전환 매니저 =======================
function switchScreen(targetScreen) {
    console.log(`[Screen] Switching to: ${targetScreen}`);
    [screenMain, screenRoom, screenGame].forEach(s => s.classList.remove('active'));

    if (targetScreen === 'main') {
        screenMain.classList.add('active');
        bgMain.classList.add('active');
        bgRoom.classList.remove('active');
    } else if (targetScreen === 'room') {
        screenRoom.classList.add('active');
        bgRoom.classList.add('active');
        bgMain.classList.remove('active');
    } else if (targetScreen === 'game') {
        screenGame.classList.add('active');
        bgRoom.classList.add('active');
        bgMain.classList.remove('active');
    }
}

// ======================= 5. 프로필 설정 및 로컬스토리지 =======================
function setupProfileUI() {
    nicknameInput.value = state.myName;
    myAvatarEl.textContent = state.myAvatar;

    function saveNickname() {
        const newName = nicknameInput.value.trim();
        if (!newName) {
            showToast('닉네임을 한 글자 이상 입력해주세요.', 'error');
            return;
        }
        state.myName = newName;
        localStorage.setItem('ocean_nickname', newName);
        if (socket && state.connected) {
            socket.emit('update_profile', { name: newName, avatar: state.myAvatar });
        }
        showToast('닉네임이 저장되었습니다!', 'success');
        playSound('click');
    }

    saveNameBtn.addEventListener('click', saveNickname);
    nicknameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveNickname();
    });

    soundToggleBtn.addEventListener('click', () => {
        state.soundEnabled = !state.soundEnabled;
        soundToggleBtn.textContent = state.soundEnabled ? '🔊 소리 켜짐' : '🔇 소리 꺼짐';
        if (state.soundEnabled) playSound('click');
    });

    // 아바타 선택 모달 생성
    avatarGrid.innerHTML = '';
    AVATARS.forEach(av => {
        const opt = document.createElement('div');
        opt.className = `avatar-option ${av === state.myAvatar ? 'selected' : ''}`;
        opt.textContent = av;
        opt.addEventListener('click', () => {
            state.myAvatar = av;
            myAvatarEl.textContent = av;
            localStorage.setItem('ocean_avatar', av);
            if (socket && state.connected) {
                socket.emit('update_profile', { name: state.myName, avatar: av });
            }
            avatarModal.classList.add('hidden');
            playSound('click');
        });
        avatarGrid.appendChild(opt);
    });

    avatarBtn.addEventListener('click', () => {
        avatarModal.classList.remove('hidden');
        playSound('click');
    });

    closeAvatarModal.addEventListener('click', () => {
        avatarModal.classList.add('hidden');
    });
}

// ======================= 6. 메인 화면 액션 =======================
// 방 만들기
createRoomBtn.addEventListener('click', () => {
    playSound('click');
    if (!socket || !state.connected) {
        showToast('서버에 연결 중입니다. 잠시 후 다시 시도해주세요.', 'error');
        return;
    }
    // 인풋창에 입력된 이름이 있다면 자동 반영
    const typedName = nicknameInput.value.trim();
    if (typedName && typedName !== state.myName) {
        state.myName = typedName;
        localStorage.setItem('ocean_nickname', typedName);
        socket.emit('update_profile', { name: typedName, avatar: state.myAvatar });
    }
    console.log('[Create Room] Emitting create_room...');
    createRoomBtn.disabled = true;
    createRoomBtn.style.opacity = '0.6';
    socket.emit('create_room');
    
    setTimeout(() => {
        createRoomBtn.disabled = false;
        createRoomBtn.style.opacity = '1';
    }, 1500);
});

// 방 찾기: 10자리 숫자 입력 제어
joinCodeInput.addEventListener('input', (e) => {
    const cleanValue = e.target.value.replace(/[^0-9]/g, '');
    e.target.value = cleanValue;
    codeCounter.textContent = `${cleanValue.length}/10`;
    if (cleanValue.length === 10) {
        codeCounter.style.color = '#06d6a0';
    } else {
        codeCounter.style.color = '#8b9bb4';
    }
});

joinCodeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') executeJoin();
});

joinRoomBtn.addEventListener('click', executeJoin);

function executeJoin() {
    const code = joinCodeInput.value.trim();
    if (code.length !== 10) {
        showToast('10자리 숫자로 된 방 코드를 입력해주세요.', 'error');
        joinCodeInput.focus();
        return;
    }
    if (!socket || !state.connected) {
        showToast('서버에 연결 중입니다. 잠시 후 다시 시도해주세요.', 'error');
        return;
    }
    // 인풋창에 입력된 이름이 있다면 자동 반영
    const typedName = nicknameInput.value.trim();
    if (typedName && typedName !== state.myName) {
        state.myName = typedName;
        localStorage.setItem('ocean_nickname', typedName);
        socket.emit('update_profile', { name: typedName, avatar: state.myAvatar });
    }
    playSound('click');
    socket.emit('join_room', { code });
}

// ======================= 7. 대기실 기능 =======================
// 코드 복사
copyCodeBtn.addEventListener('click', () => {
    if (!state.currentRoom) return;
    navigator.clipboard.writeText(state.currentRoom.code).then(() => {
        showToast(`대기실 코드(${state.currentRoom.code})가 복사되었습니다!`, 'success');
        playSound('click');
    }).catch(() => {
        showToast(`코드: ${state.currentRoom.code}`, 'info');
    });
});

// ======================= 커스텀 모달 다이얼로그 시스템 =======================
let currentDialogCallback = null;

function showCustomConfirm({
    icon = '🚪',
    title = '대기실 나가기',
    desc = '정말 대기실에서 나가시겠습니까?',
    sub = '방을 나가면 메인 화면으로 돌아갑니다.',
    confirmText = '나가기',
    cancelText = '취소',
    onConfirm = () => {}
}) {
    dialogIcon.textContent = icon;
    dialogTitle.textContent = title;
    dialogDesc.textContent = desc;
    dialogSub.textContent = sub;
    dialogConfirmBtn.textContent = confirmText;
    dialogCancelBtn.textContent = cancelText;
    dialogCancelBtn.classList.remove('hidden');
    dialogConfirmBtn.classList.remove('single-confirm');

    currentDialogCallback = onConfirm;
    customDialogModal.classList.remove('hidden');
    playSound('click');
}

function showCustomAlert({
    icon = '🚫',
    title = '알림',
    desc = '',
    sub = '',
    confirmText = '확인',
    onConfirm = () => {}
}) {
    dialogIcon.textContent = icon;
    dialogTitle.textContent = title;
    dialogDesc.textContent = desc;
    dialogSub.textContent = sub;
    dialogConfirmBtn.textContent = confirmText;
    dialogCancelBtn.classList.add('hidden');
    dialogConfirmBtn.classList.add('single-confirm');

    currentDialogCallback = onConfirm;
    customDialogModal.classList.remove('hidden');
    playSound('kick');
}

dialogConfirmBtn.addEventListener('click', () => {
    customDialogModal.classList.add('hidden');
    if (typeof currentDialogCallback === 'function') {
        currentDialogCallback();
    }
    currentDialogCallback = null;
});

dialogCancelBtn.addEventListener('click', () => {
    customDialogModal.classList.add('hidden');
    currentDialogCallback = null;
    playSound('click');
});

customDialogModal.addEventListener('click', (e) => {
    if (e.target === customDialogModal && !dialogCancelBtn.classList.contains('hidden')) {
        customDialogModal.classList.add('hidden');
        currentDialogCallback = null;
    }
});

// 나가기
leaveRoomBtn.addEventListener('click', () => {
    const isHostNotice = state.isHost 
        ? '방장이 나가면 다른 유저에게 방장이 위임되거나 방이 종료됩니다.'
        : '대기실을 나가면 메인 화면으로 복귀합니다.';
        
    showCustomConfirm({
        icon: '🚪',
        title: '대기실 나가기',
        desc: '정말 대기실에서 나가시겠습니까?',
        sub: isHostNotice,
        confirmText: '나가기',
        cancelText: '머무르기',
        onConfirm: () => {
            playSound('click');
            socket.emit('leave_room');
            switchScreen('main');
            state.currentRoom = null;
        }
    });
});

// 준비완료 / 준비중 토글
toggleReadyBtn.addEventListener('click', () => {
    playSound('ready');
    socket.emit('toggle_ready');
    toggleReadyBtn.style.transform = 'scale(0.95)';
    setTimeout(() => { toggleReadyBtn.style.transform = ''; }, 150);
});

// 방장 전용: 최대 플레이 인원 설정
maxPlayersSelect.addEventListener('change', (e) => {
    const newMax = parseInt(e.target.value);
    playSound('click');
    socket.emit('set_max_players', { max_players: newMax });
});

// 방장 전용: 게임 시작(플레이)
function triggerStartGame() {
    if (!state.isHost) {
        showToast('게임 시작은 방장만 가능합니다.', 'error');
        return;
    }
    if (!state.currentRoom) return;

    // 대기실 내 모든 플레이어의 준비 상태 검증
    const unreadyPlayers = state.currentRoom.players.filter(p => !p.is_ready);
    if (unreadyPlayers.length > 0) {
        playSound('kick');
        const names = unreadyPlayers.map(p => p.name).join(', ');
        showToast(`⚠️ 아직 준비를 마치지 않은 플레이어가 있습니다: ${names}`, 'error');
        return; // 서버 전송 차단
    }

    playSound('play');
    socket.emit('start_game');
}

startGameBtn.addEventListener('click', triggerStartGame);
if (quickStartGameBtn) {
    quickStartGameBtn.addEventListener('click', triggerStartGame);
}

// 대기실 채팅 전송
function sendChat() {
    const msg = chatInput.value.trim();
    if (!msg) return;
    socket.emit('send_chat', { message: msg });
    chatInput.value = '';
}

chatSendBtn.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChat();
});

// 사진 속 둥근 캡슐형 대기실 렌더링 함수
function renderRoom(roomData) {
    console.log('[Render Room]', roomData);
    state.currentRoom = roomData;
    displayRoomCode.textContent = roomData.code;
    playerCountText.textContent = `${roomData.current_players} / ${roomData.max_players}명`;

    // 현재 유효한 SID 확보
    const currentSid = state.mySid || (socket && socket.id);
    if (currentSid) state.mySid = currentSid;

    // 내가 방장인지 다중 조건으로 정확하게 판별
    const me = roomData.players.find(p => p.sid === currentSid);
    const amIHost = (roomData.host_sid === currentSid) || (me && me.is_host) || (state.isHost === true);
    state.isHost = amIHost;

    console.log(`[Host Check] currentSid: ${currentSid}, host_sid: ${roomData.host_sid}, isHost: ${state.isHost}`);

    // 방장 배너 및 플레이 버튼 표시/숨김
    if (state.isHost) {
        hostBanner.classList.remove('hidden');
        maxPlayersSelect.value = roomData.max_players;
        startGameBtn.classList.remove('hidden');
        startGameBtn.style.display = 'inline-flex';
        if (quickStartGameBtn) {
            quickStartGameBtn.classList.remove('hidden');
            quickStartGameBtn.style.display = 'inline-flex';
        }
    } else {
        hostBanner.classList.add('hidden');
        startGameBtn.classList.add('hidden');
        startGameBtn.style.display = 'none';
        if (quickStartGameBtn) {
            quickStartGameBtn.classList.add('hidden');
            quickStartGameBtn.style.display = 'none';
        }
    }

    // 내 준비 상태 버튼 업데이트
    if (me) {
        if (me.is_ready) {
            toggleReadyBtn.className = 'btn btn-ready-toggle ready';
            toggleReadyBtn.innerHTML = '<span class="ready-icon">✅</span> <span class="ready-text">준비 완료됨! (클릭 시 취소)</span>';
        } else {
            toggleReadyBtn.className = 'btn btn-ready-toggle unready';
            toggleReadyBtn.innerHTML = '<span class="ready-icon">⏳</span> <span class="ready-text">준비완료 하기</span>';
        }
    }

    // 준비 상태 검사: 대기실의 모든 플레이어(방장 포함)가 준비완료 상태인지 확인
    const allPlayersReady = (roomData.players.length > 0) && roomData.players.every(p => p.is_ready);
    const unreadyPlayers = roomData.players.filter(p => !p.is_ready);

    // 방장 플레이 버튼 활성화 / 잠금 제어
    if (state.isHost) {
        if (allPlayersReady) {
            startGameBtn.disabled = false;
            startGameBtn.classList.remove('btn-play-disabled');
            startGameBtn.classList.add('btn-play-active');
            startGameBtn.innerHTML = '<span class="play-icon">▶</span> <span class="play-text">플레이 (게임 시작)</span>';

            if (quickStartGameBtn) {
                quickStartGameBtn.disabled = false;
                quickStartGameBtn.classList.remove('btn-play-disabled');
                quickStartGameBtn.classList.add('btn-play-active');
                quickStartGameBtn.innerHTML = '🎮 게임 시작';
            }

            allReadyIndicator.innerHTML = '✨ <strong>모든 참가자가 준비 완료!</strong> 게임을 시작할 수 있습니다. 🌊';
            allReadyIndicator.style.color = '#00e676';
        } else {
            startGameBtn.disabled = true;
            startGameBtn.classList.add('btn-play-disabled');
            startGameBtn.classList.remove('btn-play-active');
            startGameBtn.innerHTML = '<span class="play-icon">🔒</span> <span class="play-text">준비 대기 중 (시작 불가)</span>';

            if (quickStartGameBtn) {
                quickStartGameBtn.disabled = true;
                quickStartGameBtn.classList.add('btn-play-disabled');
                quickStartGameBtn.classList.remove('btn-play-active');
                quickStartGameBtn.innerHTML = '🔒 준비 대기';
            }

            const unreadyNames = unreadyPlayers.map(p => p.name).join(', ');
            allReadyIndicator.innerHTML = `⏳ <strong>준비 대기 중:</strong> 아직 준비하지 않은 플레이어 [${escapeHtml(unreadyNames)}]`;
            allReadyIndicator.style.color = '#f4a261';
        }
    } else {
        if (allPlayersReady) {
            allReadyIndicator.innerHTML = '✨ 모든 참가자가 준비되었습니다! 방장의 시작을 기다립니다.';
            allReadyIndicator.style.color = '#00e676';
        } else {
            const unreadyNames = unreadyPlayers.map(p => p.name).join(', ');
            allReadyIndicator.innerHTML = `⏳ <strong>준비 대기 중:</strong> [${escapeHtml(unreadyNames)}]`;
            allReadyIndicator.style.color = '#f4a261';
        }
    }

    // 사진 속 디자인의 캡슐 슬롯 렌더링
    capsuleSlotsContainer.innerHTML = '';

    // 1) 입장한 플레이어 슬롯 렌더링 (사진 속 둥근 알약 캡슐 슬롯 스타일)
    roomData.players.forEach(p => {
        const isMe = (p.sid === state.mySid);
        const slot = document.createElement('div');
        
        let slotClasses = ['capsule-slot', 'slot-player'];
        if (isMe) slotClasses.push('is-me');
        if (p.is_ready) slotClasses.push('ready-active');
        if (p.is_host) slotClasses.push('is-host');
        slot.className = slotClasses.join(' ');

        // 좌측 원형 인디케이터 점 (사진 속 회색 원)
        let dotHtml = `<div class="capsule-dot" title="${p.is_ready ? '준비 완료' : '준비 중'}"></div>`;

        // 중앙 이름 (사진 속 진한 청록색 굵은 텍스트)
        let nameHtml = `
            <div class="capsule-name-wrap">
                <span class="capsule-name">${escapeHtml(p.name)}</span>
                ${p.is_ready && !p.is_host ? '<span class="ready-check-icon" title="준비 완료">✓</span>' : ''}
                ${p.is_host ? '<span class="capsule-tag-host">👑 방장</span>' : ''}
            </div>
        `;

        // 우측 상태 및 방장 전용 강퇴 버튼
        let actionsHtml = '<div class="capsule-actions">';
        if (!p.is_host) {
            actionsHtml += `<span class="capsule-ready-badge ${p.is_ready ? 'ready' : 'waiting'}">${p.is_ready ? '✅ 준비완료' : '⏳ 준비중'}</span>`;
        }
        if (state.isHost && !isMe) {
            actionsHtml += `<button class="capsule-kick-btn" data-sid="${p.sid}" data-name="${escapeHtml(p.name)}" title="${p.name} 강퇴">강퇴</button>`;
        }
        actionsHtml += '</div>';

        slot.innerHTML = dotHtml + nameHtml + actionsHtml;
        capsuleSlotsContainer.appendChild(slot);
    });

    // 강퇴 이벤트 바인딩 (세련된 커스텀 모달 적용)
    capsuleSlotsContainer.querySelectorAll('.capsule-kick-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const targetSid = e.target.getAttribute('data-sid');
            const targetName = e.target.getAttribute('data-name') || '해당 플레이어';
            showCustomConfirm({
                icon: '🚨',
                title: '플레이어 강퇴',
                desc: `${targetName} 님을 강퇴하시겠습니까?`,
                sub: '강퇴된 플레이어는 대기실에서 즉시 퇴장 처리됩니다.',
                confirmText: '강퇴하기',
                cancelText: '취소',
                onConfirm: () => {
                    playSound('kick');
                    socket.emit('kick_player', { target_sid: targetSid });
                }
            });
        });
    });

    // 2) 빈 슬롯 렌더링 (사진 속 아래쪽 청록색 테두리 투명 캡슐 슬롯들과 완벽히 일치)
    const emptyCount = Math.max(0, roomData.max_players - roomData.players.length);
    for (let i = 0; i < emptyCount; i++) {
        const emptySlot = document.createElement('div');
        emptySlot.className = 'capsule-slot slot-empty';
        capsuleSlotsContainer.appendChild(emptySlot);
    }
}

// ======================= 8. 2D 대형 바다 전장 엔진 제어 =======================
let tunaEngine = null;

backToLobbyBtn.addEventListener('click', () => {
    showCustomConfirm({
        icon: '🌊',
        title: '대기실 복귀',
        desc: '전장에서 대기실로 돌아가시겠습니까?',
        sub: '진행 중인 2D 바다 탐험을 종료하고 로비로 이동합니다.',
        confirmText: '복귀하기',
        cancelText: '머무르기',
        onConfirm: () => {
            playSound('click');
            if (tunaEngine) tunaEngine.stop();
            switchScreen('room');
        }
    });
});

// ======================= 9. Socket.io 연결 및 이벤트 바인딩 =======================
function initSocket() {
    try {
        socket = io({
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10
        });

        socket.on('connect', () => {
            console.log('[Socket] Connected to server! SID:', socket.id);
            state.connected = true;
            serverStatusPill.className = 'status-pill connected';
            serverStatusPill.textContent = '● 연결됨';

            // 서버에 내 프로필 등록
            socket.emit('update_profile', { name: state.myName, avatar: state.myAvatar });
        });

        socket.on('disconnect', () => {
            console.log('[Socket] Disconnected from server');
            state.connected = false;
            serverStatusPill.className = 'status-pill connecting';
            serverStatusPill.textContent = '● 연결 끊김 (재시도 중)';
        });

        socket.on('init_user', (data) => {
            state.mySid = data.sid;
            console.log('[Socket] init_user:', data);
            if (state.myName) {
                socket.emit('update_profile', { name: state.myName, avatar: state.myAvatar });
            } else {
                // 저장된 이름이 없으면 인풋창 placeholder 유지 (임시 이름은 내부 상태에만 저장)
                state.tempDefaultName = data.name;
            }
        });

        socket.on('profile_updated', (data) => {
            state.myName = data.name;
            state.myAvatar = data.avatar;
            nicknameInput.value = data.name;
            myAvatarEl.textContent = data.avatar;
        });

        // 방 입장 성공
        socket.on('room_joined', (data) => {
            console.log('[Socket] room_joined received:', data);
            if (data.success) {
                if (data.sid) state.mySid = data.sid;
                if (data.is_host !== undefined) state.isHost = data.is_host;
                playSound('join');
                showToast(`대기실(${data.room.code})에 입장했습니다!`, 'success');
                switchScreen('room');
                renderRoom(data.room);
            }
        });

        // 방 상태 실시간 갱신
        socket.on('room_state_update', (roomData) => {
            console.log('[Socket] room_state_update:', roomData);
            if (!roomData) {
                switchScreen('main');
                state.currentRoom = null;
                return;
            }
            renderRoom(roomData);
        });

        socket.on('join_error', (data) => {
            showToast(data.message, 'error');
            playSound('kick');
        });

        socket.on('action_error', (data) => {
            showToast(data.message, 'error');
            playSound('kick');
        });

        socket.on('kicked', (data) => {
            playSound('kick');
            showCustomAlert({
                icon: '🚫',
                title: '대기실 퇴장 알림',
                desc: data.message || '방장에 의해 대기실에서 강퇴되었습니다.',
                sub: '메인 화면으로 이동합니다.',
                confirmText: '확인',
                onConfirm: () => {
                    if (tunaEngine) tunaEngine.stop();
                    switchScreen('main');
                    state.currentRoom = null;
                }
            });
        });

        socket.on('left_room_success', () => {
            if (tunaEngine) tunaEngine.stop();
            switchScreen('main');
            state.currentRoom = null;
            showToast('대기실을 나왔습니다.', 'info');
        });

        socket.on('game_started', (data) => {
            playSound('play');
            showToast('🎮 2D 대형 바다 전장이 열렸습니다! (WASD로 이동)', 'success');
            switchScreen('game');
            gameStageRoomCode.textContent = data.room_code;
            
            // 2D 캔버스 엔진 초기화 및 구동
            if (!tunaEngine && typeof TunaOceanEngine !== 'undefined') {
                tunaEngine = new TunaOceanEngine('game-canvas', 'minimap-canvas', socket, state);
            }
            if (tunaEngine) {
                tunaEngine.start();
                // 다른 플레이어 목록 초기화
                if (Array.isArray(data.players)) {
                    data.players.forEach(p => {
                        if (p.sid !== state.mySid) {
                            tunaEngine.updateOtherPlayer(p);
                        }
                    });
                }
            }
        });

        // 실시간 다른 플레이어 2D 좌표 수신
        socket.on('other_player_pos', (data) => {
            if (tunaEngine) {
                tunaEngine.updateOtherPlayer(data);
            }
        });

        socket.on('chat_message', (data) => {
            const item = document.createElement('div');
            if (data.system) {
                item.className = 'chat-item system';
                item.textContent = data.text;
            } else {
                item.className = 'chat-item';
                const isMe = (data.sender_sid === state.mySid);
                item.innerHTML = `
                    <span class="chat-sender" style="${isMe ? 'color:#00d2ff;' : ''}">${data.avatar || '🐬'} ${data.sender}:</span>
                    <span class="chat-text">${escapeHtml(data.text)}</span>
                `;
            }
            chatMessages.appendChild(item);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        });

    } catch (err) {
        console.error('[Socket] Initialization error:', err);
        showToast('소켓 연결 중 오류가 발생했습니다: ' + err.message, 'error');
    }
}

function escapeHtml(string) {
    const div = document.createElement('div');
    div.innerText = string;
    return div.innerHTML;
}

// 초기화 실행
window.addEventListener('DOMContentLoaded', () => {
    setupProfileUI();
    initSocket();
});
