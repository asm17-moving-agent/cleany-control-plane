# 기존 EC2에 한 명령 배포

Ubuntu 24.04 EC2와 SSH private key를 사용한다. AWS 로그인이나 새 자원 생성은 하지 않는다.
로컬 도구는 Python 3, pnpm/Node, SSH와 scp이다.

```bash
python3 tools/deploy/ec2.py --host 3.36.52.62 \
  --ssh-key /home/ehdrms/Downloads/cleany.pem
```

FE를 로컬에서 빌드하고 Backend 코드·lockfile·dist만 전송한다. `.env`, Git, DB와 로컬
Python 환경은 전송하지 않으며 private key도 서버에 복사하지 않는다.
`--plan`으로 접속 없이 배포 구성을 볼 수 있다.

도메인이 없으면 외부 HTTP/HTTPS를 열지 않는다. 배포 후 SSH 터널을 자동으로 시작한다.
`http://127.0.0.1:18088`에서 EC2의 화면을 볼 수 있다. 포트 충돌 시 `--local-port`를
변경한다. 출력된 close 명령으로 터널만 종료할 수 있으며 EC2와 Backend는 계속 실행된다.
로컬 재부팅으로 터널이 종료되면 다음 명령으로 다시 연결한다.

```bash
ssh -i /home/ehdrms/Downloads/cleany.pem -N \
  -L 127.0.0.1:18088:127.0.0.1:8080 ubuntu@3.36.52.62
```

Robot Gateway도 이 컴퓨터에서는 `ws://127.0.0.1:18088/api/robots/cleany-01/gateway/ws`에
연결할 수 있다. 다른 장비에서는 별도 SSH/VPN 연결이 필요하다.

## 공개 HTTPS와 인증

먼저 앱을 배포한 뒤 다음 명령으로 공개 접속을 설정한다. DNS가 EC2를 가리키고 보안
그룹에서 TCP 80·443이 허용되어야 한다. 8080은 열지 않는다.

```bash
python3 tools/deploy/public.py --host 3.36.52.62 \
  --ssh-key /home/ehdrms/Downloads/cleany.pem \
  --domain cleany-3-36-52-62.sslip.io
```

Caddy가 인증서를 발급하고 HTTP를 HTTPS로 전환한다. 운영자는 회사가 발급한 앱 계정으로 로그인한다. [계정 발급](../../apps/backend/README.md#계정-발급과-첫-실행)은 서버 DB를 지정한다. Robot WebSocket 두 경로는 별도 `cleany-robot`
계정만 허용하며 Robot 클라이언트는 WSS 요청에 `Authorization: Basic ...` 헤더를
전달해야 한다. Backend에서 발급한 `X-Cleany-Robot-Token`도 함께 전달한다. Robot 계정으로 미션 생성 API를 호출할 수 없다. 다른 Origin에서 보내는
POST·PUT·PATCH·DELETE 요청은 거부한다. Backend는 localhost에서만 수신한다.

비밀번호는 로컬 `~/.local/state/cleany/ec2/ssh/<IP>/public-credentials.json`에 권한
0600으로 저장한다. 서버에는 bcrypt 해시만 저장한다. 같은 명령을 다시 실행하면 기존
계정을 유지한다. 이 파일을 분실했는데 서버에 공개 설정이 있으면 자동으로 계정을
교체하지 않는다. 비밀번호를 Git에 넣거나 URL에 포함하지 않는다.

공개 설정 후 일반 `ec2.py` 배포는 기존 Caddy 인증과 도메인을 유지한다. `--domain`은
이미 공개 설정된 도메인에만 사용할 수 있다. 공개 설정 전에는 SSH 터널을 사용한다.
현재 sslip.io 주소는 임시 운영 주소다. 일반 공인 IP는 인스턴스 중지 후 바뀔 수 있으므로
고정 운영 주소가 필요하면 Elastic IP와 소유한 도메인을 별도로 설정한다.

## 운영과 반복 배포

- `/opt/cleany/current`: 현재 release symlink, 이전 release도 보존한다.
- `cleany-backend.service`: 단일 Python 프로세스, 부팅 시 시작·실패 시 자동 재시작.
- `/etc/cleany/backend.env`: Backend 설정. 최초에 생성하고 반복 배포 때 기존 설정을 보존한다.
- `/var/lib/cleany/control-plane.db`: SQLite 데이터. 반복 배포에서도 유지한다.
- `cleany-backup.timer`: 매일 SQLite backup API로 일관된 백업을 만들고 7일간 보관한다.
- `/var/lib/cleany/backups/`: 로컬 백업. 같은 EBS에 있으므로 서버/볼륨 유실에 대비한
  별도 EBS snapshot 또는 외부 백업은 추가로 필요하다.

```bash
ssh -i /home/ehdrms/Downloads/cleany.pem ubuntu@3.36.52.62 \
  'sudo systemctl status cleany-backend --no-pager; sudo journalctl -u cleany-backend -n 30 --no-pager'
```

미션 실행 중 배포는 WebSocket을 끊으므로 가용 상태에서 배포한다. 새 release가 health
check에 실패하면 DB schema가 바뀌지 않은 경우 이전 release로 되돌린다. schema 변경 시 자동 앱 롤백을 하지 않는다. 배포 전 DB 백업을 `/var/lib/cleany/before-deploy-*.db`에 보존한다. health check는 Robot/Gazebo 검증이 아니다.
OS는 package 업데이트가 가능한 전용 Ubuntu 호스트를 전제로 하며 기존 Caddy 설정을
관리하므로 다른 서비스와 함께 쓰는 호스트에는 그대로 적용하지 않는다.

EC2의 타입·보안 그룹·주소·EBS 암호화/종료 시 삭제 설정은 변경하지 않는다.
기존 EC2나 로컬의 다른 Backend/ROS 프로세스는 종료하지 않는다.

SSH 터널에서 HTTP로 로그인할 때는 서버의 `CLEANY_COOKIE_SECURE=false`와 허용 Origin을 명시한다. 공개 HTTPS 전환 전 Secure 설정을 복구한다. 인증 전환 배포에는 `public.py`를 다시 실행해 사용자 공통 Basic 인증을 제거한다. 이 저장소 변경으로 원격 서버를 배포하지는 않았다.
