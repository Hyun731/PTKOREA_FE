# PTKOREA_FE

리서치 팩트북 웹 화면 (Next.js 15, React 19). 데이터와 계산은 모두 백엔드 API(`/v1`)에서 받습니다.

## 실행

```bash
npm install && npm run dev
```

브라우저의 `/v1/*` 요청은 `next.config.mjs`가 `API_ORIGIN`(기본 `http://127.0.0.1:8000`)으로 넘깁니다.

## 환경변수

`.env.example` 참고. 실제 값은 `.env.local`이나 Vercel 환경변수에만 넣습니다(git 제외).

| 이름 | 설명 |
|---|---|
| `API_ORIGIN` | 백엔드 주소. 빌드 때 읽으므로 바꾸면 다시 배포 |
| `BACKEND_TOKEN` | 백엔드와 같은 값. 서버에서만 백엔드로 보내며 브라우저에는 노출되지 않음 |
| `SHARE_PASSWORD` | 사이트 비밀번호(HTTP Basic, 아이디는 아무거나) |

## Vercel

저장소를 가져오면 Next.js로 자동 인식됩니다(Root Directory는 기본값 그대로). 위 환경변수 세 개를 넣고 배포합니다.
