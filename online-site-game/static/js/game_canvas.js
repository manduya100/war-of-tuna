/**
 * WAR OF TUNA - 2D Large Ocean Canvas Engine (Starcraft-style 9 Square Zones x 9x9 Sub-grids)
 */

const SUB_GRID_COUNT = 9;   // 한 구역당 9x9 작은 칸 (총 81개 칸)
const SUB_CELL_SIZE = 900;  // 작은 칸 1개 크기: 900 x 900
const ZONE_SIZE = SUB_GRID_COUNT * SUB_CELL_SIZE;   // 1개 대형 구역 크기: 8,100 x 8,100
const WORLD_SIZE = ZONE_SIZE * 3; // 총 3x3 구역: 24,300 x 24,300 (총 27x27 = 729칸 광활한 바다)
const VIEW_SIZE = 720;    // 정사각형 게임 뷰포트 크기

class TunaOceanEngine {
    constructor(canvasId, minimapId, socket, state) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.minimapCanvas = document.getElementById(minimapId);
        this.minimapCtx = this.minimapCanvas.getContext('2d');
        this.socket = socket;
        this.state = state;

        // 참치 플레이어 스프라이트 이미지 로드
        this.tunaImg = new Image();
        this.tunaImg.src = '/static/images/tuna_player_right.png';
        this.tunaImgLoaded = false;
        this.tunaImg.onload = () => { this.tunaImgLoaded = true; };

        // 카메라 위치 (구역 5 가운데 정중앙을 비춤)
        this.camera = { 
            x: WORLD_SIZE / 2 - VIEW_SIZE / 2, 
            y: WORLD_SIZE / 2 - VIEW_SIZE / 2 
        };

        // 내 참치 플레이어 상태 (구역 5 가운데 [5-5] 칸 정중앙: x: 12150, y: 12150)
        this.player = {
            x: WORLD_SIZE / 2,
            y: WORLD_SIZE / 2,
            speed: 12,        // 쾌적한 기본 수영 속도
            boostSpeed: 22,   // Shift 부스터 속도
            angle: 0,
            tailAngle: 0,
            isMoving: false,
            isBoosting: false,
            zone: "구역 5 (가운데) [5-5]"
        };

        // 다른 플레이어 딕셔너리
        this.otherPlayers = {};

        // 키 입력 상태
        this.keys = {};

        // 기포 파티클 및 수영 트레일
        this.bubbleParticles = [];
        this.trailParticles = [];
        this.initBubbles();

        this.lastNetworkSync = 0;
        this.isRunning = false;
        this.animId = null;

        this.setupEvents();
    }

    initBubbles() {
        this.bubbleParticles = [];
        for (let i = 0; i < 90; i++) {
            this.bubbleParticles.push({
                relX: (Math.random() - 0.5) * VIEW_SIZE * 1.5,
                relY: (Math.random() - 0.5) * VIEW_SIZE * 1.5,
                radius: 2 + Math.random() * 5,
                speedY: 0.6 + Math.random() * 1.2,
                drift: Math.random() * Math.PI * 2,
                opacity: 0.15 + Math.random() * 0.35
            });
        }
    }

    setupEvents() {
        window.addEventListener('keydown', (e) => {
            const activeScreen = document.getElementById('screen-game');
            if (!activeScreen || !activeScreen.classList.contains('active')) return;
            if (document.activeElement.tagName === 'INPUT') return;

            const key = e.key.toLowerCase();
            if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift'].includes(key)) {
                this.keys[key] = true;
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            const key = e.key.toLowerCase();
            this.keys[key] = false;
        });
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.player.x = WORLD_SIZE / 2;
        this.player.y = WORLD_SIZE / 2;
        this.camera.x = this.player.x - VIEW_SIZE / 2;
        this.camera.y = this.player.y - VIEW_SIZE / 2;
        this.updateZoneName();

        const loop = (timestamp) => {
            if (!this.isRunning) return;
            this.update(timestamp);
            this.render(timestamp);
            this.renderMinimap();
            this.animId = requestAnimationFrame(loop);
        };
        this.animId = requestAnimationFrame(loop);
    }

    stop() {
        this.isRunning = false;
        if (this.animId) cancelAnimationFrame(this.animId);
    }

    update(timestamp) {
        // 1. WASD 및 방향키 이동 계산
        let dx = 0;
        let dy = 0;

        if (this.keys['w'] || this.keys['arrowup']) dy -= 1;
        if (this.keys['s'] || this.keys['arrowdown']) dy += 1;
        if (this.keys['a'] || this.keys['arrowleft']) dx -= 1;
        if (this.keys['d'] || this.keys['arrowright']) dx += 1;

        const isBoosting = !!this.keys['shift'];
        this.player.isBoosting = isBoosting;
        const currentSpeed = isBoosting ? this.player.boostSpeed : this.player.speed;

        if (dx !== 0 || dy !== 0) {
            this.player.isMoving = true;
            const len = Math.hypot(dx, dy);
            dx /= len;
            dy /= len;

            this.player.x += dx * currentSpeed;
            this.player.y += dy * currentSpeed;

            // 회전 각도 부드럽게 추적
            const targetAngle = Math.atan2(dy, dx);
            let angleDiff = targetAngle - this.player.angle;
            while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
            while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
            this.player.angle += angleDiff * 0.22;

            // 꼬리 흔들림 애니메이션 (부스터 시 더 빠르게)
            const wiggleFreq = isBoosting ? 0.035 : 0.02;
            this.player.tailAngle = Math.sin(timestamp * wiggleFreq) * 0.4;

            // 수영 거품(트레일) 파티클 생성
            const trailCount = isBoosting ? 2 : 1;
            for (let t = 0; t < trailCount; t++) {
                const tailDist = 30;
                const trailX = this.player.x - Math.cos(this.player.angle) * tailDist + (Math.random() - 0.5) * 10;
                const trailY = this.player.y - Math.sin(this.player.angle) * tailDist + (Math.random() - 0.5) * 10;
                this.trailParticles.push({
                    x: trailX,
                    y: trailY,
                    radius: isBoosting ? (3 + Math.random() * 5) : (2 + Math.random() * 3.5),
                    life: 1.0,
                    decay: isBoosting ? 0.06 : 0.04
                });
            }
        } else {
            this.player.isMoving = false;
            this.player.tailAngle = Math.sin(timestamp * 0.005) * 0.12;
        }

        // 2. 월드 경계선 클램핑 (24,000 x 24,000 바다 안으로 제한)
        const margin = 40;
        this.player.x = Math.max(margin, Math.min(WORLD_SIZE - margin, this.player.x));
        this.player.y = Math.max(margin, Math.min(WORLD_SIZE - margin, this.player.y));

        // 3. 카메라 부드러운 팔로우 추적
        const targetCamX = this.player.x - VIEW_SIZE / 2;
        const targetCamY = this.player.y - VIEW_SIZE / 2;
        const clampedCamX = Math.max(0, Math.min(WORLD_SIZE - VIEW_SIZE, targetCamX));
        const clampedCamY = Math.max(0, Math.min(WORLD_SIZE - VIEW_SIZE, targetCamY));
        this.camera.x += (clampedCamX - this.camera.x) * 0.15;
        this.camera.y += (clampedCamY - this.camera.y) * 0.15;

        // 4. 구역 판별
        this.updateZoneName();

        // 5. 트레일 거품 파티클 업데이트
        for (let i = this.trailParticles.length - 1; i >= 0; i--) {
            const p = this.trailParticles[i];
            p.life -= p.decay;
            p.radius *= 0.97;
            if (p.life <= 0) {
                this.trailParticles.splice(i, 1);
            }
        }

        // 6. 자연 기포 파티클 (카메라 주변 상대 위치 순환)
        this.bubbleParticles.forEach(b => {
            b.relY -= b.speedY;
            b.drift += 0.02;
            b.relX += Math.sin(b.drift) * 0.4;
            if (b.relY < -VIEW_SIZE * 0.75) {
                b.relY = VIEW_SIZE * 0.75;
                b.relX = (Math.random() - 0.5) * VIEW_SIZE * 1.5;
            }
        });

        // 7. 다른 플레이어 위치 보간 (Lerp)
        Object.values(this.otherPlayers).forEach(op => {
            if (op.targetX !== undefined) op.x += (op.targetX - op.x) * 0.25;
            if (op.targetY !== undefined) op.y += (op.targetY - op.y) * 0.25;
            if (op.targetAngle !== undefined) {
                let diff = op.targetAngle - op.angle;
                while (diff < -Math.PI) diff += Math.PI * 2;
                while (diff > Math.PI) diff -= Math.PI * 2;
                op.angle += diff * 0.25;
            }
        });

        // 8. 초당 25회 네트워크 전송
        if (timestamp - this.lastNetworkSync > 40) {
            this.lastNetworkSync = timestamp;
            if (this.socket && this.socket.connected) {
                this.socket.emit('player_pos_update', {
                    x: Math.round(this.player.x),
                    y: Math.round(this.player.y),
                    angle: parseFloat(this.player.angle.toFixed(2)),
                    zone: this.player.zone
                });
            }
        }
    }

    updateZoneName() {
        const col = Math.floor(this.player.x / ZONE_SIZE); // 0, 1, 2
        const row = Math.floor(this.player.y / ZONE_SIZE); // 0, 1, 2
        const safeCol = Math.max(0, Math.min(2, col));
        const safeRow = Math.max(0, Math.min(2, row));
        const zoneNum = safeRow * 3 + safeCol + 1; // 1 ~ 9

        // 해당 대형 구역 내의 9x9 작은 칸 좌표 계산 (1~9열, 1~9행)
        const localX = this.player.x - safeCol * ZONE_SIZE;
        const localY = this.player.y - safeRow * ZONE_SIZE;
        const subCol = Math.max(1, Math.min(SUB_GRID_COUNT, Math.floor(localX / SUB_CELL_SIZE) + 1));
        const subRow = Math.max(1, Math.min(SUB_GRID_COUNT, Math.floor(localY / SUB_CELL_SIZE) + 1));

        const zoneText = zoneNum === 5 
            ? `구역 5 (가운데) [${subCol}-${subRow}]` 
            : `구역 ${zoneNum} [${subCol}-${subRow}]`;
        this.player.zone = zoneText;

        const currentZoneEl = document.getElementById('current-zone-name');
        if (currentZoneEl && currentZoneEl.textContent !== zoneText) {
            currentZoneEl.textContent = zoneText;
        }

        const minimapCoords = document.getElementById('minimap-coords');
        if (minimapCoords) {
            minimapCoords.textContent = zoneNum === 5 
                ? `구역 5 [${subCol}-${subRow}]` 
                : `구역 ${zoneNum} [${subCol}-${subRow}]`;
        }
    }

    render(timestamp) {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, VIEW_SIZE, VIEW_SIZE);

        ctx.save();
        ctx.translate(-Math.round(this.camera.x), -Math.round(this.camera.y));

        // 1. 깊은 2D 바다 배경 렌더링
        this.render2DOcean(ctx, timestamp);

        // 2. 10배 확대된 3x3 초대형 구역 경계선 및 구역 번호 바닥 표기
        this.render9Zones(ctx);

        // 3. 수영 물방울 트레일 렌더링
        this.renderTrails(ctx);

        // 4. 자연 부유 기포 렌더링
        this.renderBubbles(ctx);

        // 5. 다른 플레이어 참치 렌더링
        Object.values(this.otherPlayers).forEach(op => {
            this.drawTunaFish(ctx, op.x, op.y, op.angle, op.name, false, op.isHost, false);
        });

        // 6. 내 참치 플레이어 렌더링
        this.drawTunaFish(
            ctx,
            this.player.x,
            this.player.y,
            this.player.angle,
            this.state.myName || "내 참치",
            true,
            this.state.isHost,
            this.player.tailAngle
        );

        ctx.restore();
    }

    render2DOcean(ctx, timestamp) {
        // 화면에 보이는 카메라 영역 주변만 효율적으로 렌더링
        const cx = this.camera.x;
        const cy = this.camera.y;

        // 깊고 푸른 순수 2D 바다 베이스
        ctx.fillStyle = '#001a35';
        ctx.fillRect(cx - 20, cy - 20, VIEW_SIZE + 40, VIEW_SIZE + 40);

        // 일렁이는 2D 수면 굴절 물결 광선 (Caustics lines)
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 210, 255, 0.08)';
        ctx.lineWidth = 4;

        const startY = Math.floor(cy / 180) * 180 - 180;
        const endY = cy + VIEW_SIZE + 180;

        for (let y = startY; y <= endY; y += 180) {
            ctx.beginPath();
            ctx.moveTo(cx - 50, y);
            for (let x = cx - 50; x <= cx + VIEW_SIZE + 50; x += 120) {
                const waveY = y + Math.sin((x + timestamp * 0.04) * 0.015) * 24;
                ctx.lineTo(x, waveY);
            }
            ctx.stroke();
        }
        ctx.restore();
    }

    render9Zones(ctx) {
        ctx.save();

        const cx = this.camera.x;
        const cy = this.camera.y;

        // 3x3 대형 구역 (각 8,100 x 8,100)
        for (let row = 0; row < 3; row++) {
            for (let col = 0; col < 3; col++) {
                const zx = col * ZONE_SIZE;
                const zy = row * ZONE_SIZE;
                const zoneNum = row * 3 + col + 1;
                const isCenter = (zoneNum === 5);

                // 카메라 시야에 들어오는 대형 구역만 컬링 렌더링
                if (zx + ZONE_SIZE < cx || zx > cx + VIEW_SIZE ||
                    zy + ZONE_SIZE < cy || zy > cy + VIEW_SIZE) {
                    continue;
                }

                // ==========================================
                // 1. 대형 구역 내부 9x9 작은 칸 (총 81칸) 렌더링
                // ==========================================
                const minSubCol = Math.max(0, Math.floor((cx - zx) / SUB_CELL_SIZE));
                const maxSubCol = Math.min(SUB_GRID_COUNT - 1, Math.floor((cx + VIEW_SIZE - zx) / SUB_CELL_SIZE));
                const minSubRow = Math.max(0, Math.floor((cy - zy) / SUB_CELL_SIZE));
                const maxSubRow = Math.min(SUB_GRID_COUNT - 1, Math.floor((cy + VIEW_SIZE - zy) / SUB_CELL_SIZE));

                for (let sc = minSubCol; sc <= maxSubCol; sc++) {
                    for (let sr = minSubRow; sr <= maxSubRow; sr++) {
                        const sx = zx + sc * SUB_CELL_SIZE;
                        const sy = zy + sr * SUB_CELL_SIZE;

                        // 작은 칸 격자 테두리선 (900 x 900)
                        ctx.lineWidth = 1.5;
                        if (isCenter) {
                            ctx.strokeStyle = 'rgba(255, 209, 102, 0.22)'; // 가운데 구역은 은은한 골드빛
                        } else {
                            ctx.strokeStyle = 'rgba(0, 210, 255, 0.18)';  // 사이버 네온 블루 격자
                        }
                        ctx.strokeRect(sx, sy, SUB_CELL_SIZE, SUB_CELL_SIZE);

                        // 작은 칸 4개 모서리에 스타크래프트/SF 레이더 스타일 십자 앵커 포인트 (+)
                        ctx.strokeStyle = isCenter ? 'rgba(255, 209, 102, 0.45)' : 'rgba(0, 210, 255, 0.40)';
                        ctx.lineWidth = 1.2;
                        const tick = 8;
                        // 좌상단 +
                        ctx.beginPath();
                        ctx.moveTo(sx - tick, sy); ctx.lineTo(sx + tick, sy);
                        ctx.moveTo(sx, sy - tick); ctx.lineTo(sx, sy + tick);
                        ctx.stroke();

                        // 작은 칸 번호 태그 (좌측 상단: 예 1-1, 5-5, 9-9)
                        ctx.font = '700 16px "Outfit", monospace';
                        ctx.fillStyle = isCenter ? 'rgba(255, 209, 102, 0.38)' : 'rgba(0, 210, 255, 0.32)';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'top';
                        ctx.fillText(`${sc + 1}-${sr + 1}`, sx + 14, sy + 14);
                    }
                }

                // ==========================================
                // 2. 대형 구역 외곽 테두리선 (두껍고 선명하게 강조)
                // ==========================================
                if (isCenter) {
                    ctx.strokeStyle = 'rgba(255, 209, 102, 0.70)'; // 가운데 구역은 황금 테두리
                    ctx.lineWidth = 6;
                } else {
                    ctx.strokeStyle = 'rgba(0, 210, 255, 0.50)';  // 주요 구역 외곽선
                    ctx.lineWidth = 4;
                }
                ctx.strokeRect(zx, zy, ZONE_SIZE, ZONE_SIZE);

                // ==========================================
                // 3. 바다 바닥 거대한 네온 구역 번호 워터마크
                // ==========================================
                const centerTextX = zx + ZONE_SIZE / 2;
                const centerTextY = zy + ZONE_SIZE / 2;

                // 텍스트가 시야 주변에 있을 때만 렌더링
                if (Math.abs(centerTextX - (cx + VIEW_SIZE / 2)) < VIEW_SIZE * 1.5 &&
                    Math.abs(centerTextY - (cy + VIEW_SIZE / 2)) < VIEW_SIZE * 1.5) {
                    ctx.font = '900 260px "Outfit", "Jua", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    if (isCenter) {
                        ctx.fillStyle = 'rgba(255, 209, 102, 0.12)';
                        ctx.fillText(`구역 5 (가운데)`, centerTextX, centerTextY);
                    } else {
                        ctx.fillStyle = 'rgba(0, 210, 255, 0.08)';
                        ctx.fillText(`구역 ${zoneNum}`, centerTextX, centerTextY);
                    }
                }

                // ==========================================
                // 4. 대형 구역 모서리 라벨 (시야 안에 있을 때)
                // ==========================================
                if (Math.abs(zx + 40 - cx) < VIEW_SIZE && Math.abs(zy + 60 - cy) < VIEW_SIZE) {
                    ctx.font = '800 36px "Noto Sans KR", sans-serif';
                    ctx.fillStyle = isCenter ? 'rgba(255, 209, 102, 0.55)' : 'rgba(0, 210, 255, 0.45)';
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'alphabetic';
                    ctx.fillText(`[구역 ${zoneNum}]`, zx + 40, zy + 60);
                }
            }
        }
        ctx.restore();
    }

    renderTrails(ctx) {
        ctx.save();
        this.trailParticles.forEach(p => {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(186, 230, 253, ${p.life * 0.45})`;
            ctx.fill();
        });
        ctx.restore();
    }

    renderBubbles(ctx) {
        ctx.save();
        const centerX = this.camera.x + VIEW_SIZE / 2;
        const centerY = this.camera.y + VIEW_SIZE / 2;

        this.bubbleParticles.forEach(b => {
            const bx = centerX + b.relX;
            const by = centerY + b.relY;

            ctx.beginPath();
            ctx.arc(bx, by, b.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(224, 242, 254, ${b.opacity})`;
            ctx.fill();
            ctx.strokeStyle = `rgba(255, 255, 255, ${b.opacity * 1.5})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        });
        ctx.restore();
    }

    drawTunaFish(ctx, x, y, angle, name, isMe, isHost, tailWiggle) {
        ctx.save();
        ctx.translate(x, y);

        // 내 캐릭터 밑에 뿜어지는 수중 네온 링 오라
        if (isMe) {
            ctx.beginPath();
            ctx.arc(0, 0, 36, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(0, 210, 255, 0.65)';
            ctx.lineWidth = 2.5;
            ctx.setLineDash([6, 6]);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        ctx.rotate(angle);

        // 참치 수영 시 미세한 상하 틸트 애니메이션
        const wiggle = tailWiggle || 0;
        ctx.rotate(wiggle * 0.25);

        const tunaW = 84;
        const tunaH = 58;

        if (this.tunaImgLoaded && this.tunaImg.complete) {
            // 사용자 지정 2D 왕관 참치 캐릭터 스프라이트 렌더링
            ctx.drawImage(this.tunaImg, -tunaW / 2, -tunaH / 2, tunaW, tunaH);
        } else {
            ctx.fillStyle = '#00d2ff';
            ctx.beginPath();
            ctx.ellipse(0, 0, 28, 14, 0, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore(); // 회전 복귀

        // 머리 위 둥근 알약 캡슐형 닉네임 명찰 (사진 속 디자인 완벽 반영)
        this.drawPlayerPillBadge(ctx, x, y - 44, name, isMe, isHost);
    }

    drawPlayerPillBadge(ctx, px, py, name, isMe, isHost) {
        ctx.save();
        ctx.font = '800 13px "Noto Sans KR", sans-serif';
        const textWidth = ctx.measureText(name).width;
        const pillWidth = textWidth + (isHost ? 48 : 28);
        const pillHeight = 24;

        const left = px - pillWidth / 2;
        const top = py - pillHeight / 2;

        // 캡슐 배경 (사진 속 밝은 회백색)
        ctx.fillStyle = 'rgba(240, 243, 246, 0.95)';
        ctx.strokeStyle = isMe ? '#00d2ff' : '#94a3b8';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        ctx.roundRect(left, top, pillWidth, pillHeight, 9999);
        ctx.fill();
        ctx.stroke();

        // 좌측 원형 점
        ctx.beginPath();
        ctx.arc(left + 10, py, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = isHost ? '#ffd166' : (isMe ? '#00e676' : '#94a3b8');
        ctx.fill();

        // 중앙 닉네임 (사진 속 선명한 청록색)
        ctx.fillStyle = '#007a78';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, left + 19, py + 1);

        // 방장 왕관 뱃지
        if (isHost) {
            ctx.font = '10px "Noto Sans KR", sans-serif';
            ctx.fillStyle = '#b45309';
            ctx.fillText('👑', left + pillWidth - 16, py);
        }

        ctx.restore();
    }

    renderMinimap() {
        const mctx = this.minimapCtx;
        const msize = 135; // 135 x 135 정사각형 미니맵
        mctx.clearRect(0, 0, msize, msize);

        // 1. 미니맵 바다 배경
        mctx.fillStyle = '#001428';
        mctx.fillRect(0, 0, msize, msize);

        // 2. 3x3 대형 구역 및 내부 9x9 작은 칸 미세 격자선 (대형 칸: 45px x 45px, 작은 칸: 5px x 5px)
        const step = msize / 3; // 45px
        const subStep = step / SUB_GRID_COUNT; // 5px

        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 3; c++) {
                const mx = c * step;
                const my = r * step;
                const num = r * 3 + c + 1;
                const isCenter = (num === 5);

                if (isCenter) {
                    mctx.fillStyle = 'rgba(255, 209, 102, 0.10)';
                    mctx.fillRect(mx, my, step, step);
                }

                // 각 대형 구역 내부 9x9 작은 칸 미세 격자선 (레이더 그리드 스타일)
                mctx.strokeStyle = isCenter ? 'rgba(255, 209, 102, 0.16)' : 'rgba(0, 210, 255, 0.12)';
                mctx.lineWidth = 0.5;

                for (let sc = 1; sc < SUB_GRID_COUNT; sc++) {
                    const lx = mx + sc * subStep;
                    mctx.beginPath();
                    mctx.moveTo(lx, my);
                    mctx.lineTo(lx, my + step);
                    mctx.stroke();
                }
                for (let sr = 1; sr < SUB_GRID_COUNT; sr++) {
                    const ly = my + sr * subStep;
                    mctx.beginPath();
                    mctx.moveTo(mx, ly);
                    mctx.lineTo(mx + step, ly);
                    mctx.stroke();
                }

                // 대형 구역 경계 외곽선
                mctx.strokeStyle = isCenter ? 'rgba(255, 209, 102, 0.75)' : 'rgba(0, 210, 255, 0.45)';
                mctx.lineWidth = 1.2;
                mctx.strokeRect(mx, my, step, step);

                // 구역 번호
                mctx.font = '700 11px "Outfit", sans-serif';
                mctx.fillStyle = (num === 5) ? 'rgba(255, 209, 102, 0.75)' : 'rgba(0, 210, 255, 0.45)';
                mctx.textAlign = 'center';
                mctx.textBaseline = 'middle';
                mctx.fillText(num, mx + step / 2, my + step / 2);
            }
        }

        // 전체 월드 대비 미니맵 스케일 (135 / 24,300)
        const scale = msize / WORLD_SIZE;

        // 3. 스타크래프트 스타일 실시간 카메라 시야 사각형 (Camera Viewport Box)
        const camBoxX = this.camera.x * scale;
        const camBoxY = this.camera.y * scale;
        const camBoxW = Math.max(5, VIEW_SIZE * scale);
        const camBoxH = Math.max(5, VIEW_SIZE * scale);

        mctx.strokeStyle = '#00e676'; // 시야 사각형 선명한 초록/시안
        mctx.lineWidth = 1.5;
        mctx.strokeRect(camBoxX, camBoxY, camBoxW, camBoxH);

        // 4. 다른 플레이어 점 (오렌지 점)
        Object.values(this.otherPlayers).forEach(op => {
            mctx.beginPath();
            mctx.arc(op.x * scale, op.y * scale, 2.5, 0, Math.PI * 2);
            mctx.fillStyle = '#ff9f1c';
            mctx.fill();
        });

        // 5. 내 참치 위치 점 (밝은 초록빛 네온 점)
        mctx.beginPath();
        mctx.arc(this.player.x * scale, this.player.y * scale, 3.5, 0, Math.PI * 2);
        mctx.fillStyle = '#00e676';
        mctx.fill();
        mctx.strokeStyle = '#ffffff';
        mctx.lineWidth = 1;
        mctx.stroke();
    }

    updateOtherPlayer(data) {
        if (!this.otherPlayers[data.sid]) {
            this.otherPlayers[data.sid] = {
                x: data.x || (WORLD_SIZE / 2),
                y: data.y || (WORLD_SIZE / 2),
                angle: data.angle || 0,
                targetX: data.x || (WORLD_SIZE / 2),
                targetY: data.y || (WORLD_SIZE / 2),
                targetAngle: data.angle || 0,
                name: data.name,
                avatar: data.avatar,
                isHost: false
            };
        } else {
            const op = this.otherPlayers[data.sid];
            op.targetX = data.x;
            op.targetY = data.y;
            op.targetAngle = data.angle;
            op.name = data.name;
        }
    }

    removeOtherPlayer(sid) {
        delete this.otherPlayers[sid];
    }
}
