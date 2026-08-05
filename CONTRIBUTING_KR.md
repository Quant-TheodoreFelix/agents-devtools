# 기여 가이드

[![Language](https://img.shields.io/badge/CONTRIBUTING-English_Ver-blue?style=for-the-badge)](CONTRIBUTING.md)

agents-devtools에 관심 가져주셔서 감사합니다. 이 문서는 개발 환경 준비부터 PR 제출까지, 기여에 필요한 모든 것을 안내합니다.

> [!IMPORTANT]
> 이 프로젝트는 Cloudflare Agents SDK와 함께 동작하는 비공식 커뮤니티 도구입니다. Cloudflare와 제휴하거나 지원받지 않습니다.

## 개발 환경 준비

Node 20 이상과 pnpm이 필요합니다.

```sh
$ git clone https://github.com/Quant-TheodoreFelix/agents-devtools.git
$ cd agents-devtools
$ pnpm install
$ pnpm build       # collector CLI와 UI 빌드
$ pnpm test        # 전체 vitest 실행
$ pnpm typecheck   # 전체 타입 검사
```

## 저장소 구조

pnpm 모노레포이며 패키지별 역할이 명확히 나뉩니다.

| 경로                    | 역할                                         |
|-----------------------|--------------------------------------------|
| `packages/protocol`   | 이벤트 봉투/NDJSON 세션 포맷/채널 매핑 정의 (의존성 없음)      |
| `packages/client`     | 에이전트에 심는 `devtools()` 팩토리 (Workers 런타임 타겟) |
| `packages/collector`  | 수집 서버 + CLI **(npm에 배포되는 유일한 패키지)**        |
| `packages/ui`         | React 웹 UI (Vite + Zustand)                |
| `examples/demo-agent` | 기능 시연/검증용 데모 에이전트 (API 키 불필요)              |

`protocol` `client` `ui`는 private 워크스페이스 패키지로, 빌드 시점에 collector 안으로 병합(번들)됩니다. collector의 `dependencies`에 이들을 추가하면 안 됩니다(런타임 의존이 아니며, 추가 시 소비자 설치 시 문제가 생길 수 있습니다).

## 변경 검증 절차

유닛 테스트만으로 부족한 변경(수집 경로, UI 동작)은 데모 에이전트로 종단 검증할 수 있습니다.

```sh
# 터미널 1 - DevTools (collector :4111 + UI :4110)
$ node packages/collector/dist/cli.js

# 터미널 2 - 데모 에이전트
$ cd examples/demo-agent && pnpm dev

# 터미널 3 - 이벤트 유발
$ cd examples/demo-agent
$ pnpm exercise                # 기본 이벤트 (rpc, state, schedule, connect)
$ pnpm exercise:scenarios s1   # 채팅 스트림 스톨 -> 리커버리 체인
$ pnpm exercise:scenarios s2   # 스케줄 중복 경고
$ pnpm exercise:scenarios s4   # MCP 연결 실패
$ pnpm exercise:fiber          # 타임라인용 합성 fiber 스팬
```

로컬에서 `npm pack`으로 배포물을 테스트하시는 경우 `packages/collector/` 안에 생성된 `ui-dist/` `LICENSE` `README.md`를 반드시 삭제해주세요. 남겨두면 collector가 최신 UI 빌드 대신 그 복사본을 서빙해, 개발 중 변경이 반영되지 않는 것처럼 보입니다.

## 지켜야 할 설계 제약

PR이 다음을 준수하지 않는 경우 병합할 수 없습니다.

1. **client는 에이전트에 영향을 주지 않는다.**
   - 예외를 밖으로 던지지 않고, SDK 기본 방출(`base`)로 가는 이벤트를 변형하지 않으며, collector가 없으면 조용히 실패 후 스스로 비활성화합니다.
2. **collector는 격리가 기본이다.**
   - 기본 바인딩은 `127.0.0.1`, 외부로 어떤 데이터도 전송하지 않고, 수신하는 모든 입력은 형식을 검증해 거부할 수 있어야 합니다.
3. **NDJSON 세션 포맷 v1은 안정 계약이다.**
   - 기존 필드의 의미/타입 변경(breaking change)은 금지입니다. 확장은 하위호환 방식(새로운 optional 필드)으로만 가능합니다.
4. **알 수 없는 이벤트도 수용한다.**
   - SDK가 새 이벤트 타입을 추가해도 UI는 크래시 없이 raw로 표시해야 합니다.

## 코드 규약

- TypeScript strict 기준이며 `pnpm typecheck`가 통과해야 합니다.
- 새 기능과 버그 수정에는 vitest 테스트를 함께 추가하세요. 순수 로직(도메인 빌더, 포맷 파싱)은 UI 컴포넌트와 분리해 테스트 가능한 모듈로 두는 것이 이 저장소의 패턴입니다.
- 주석은 코드로 표현할 수 없는 제약을 설명할 때만 최소한으로 작성합니다.

> [!TIP]
> AI 에이전트는 자유롭게 활용할 수 있습니다. 이 경우 `Co-authored-by` 트레일을 **모델명을 포함하여** 추가하세요.

### UI 문자열과 다국어

UI에 보이는 모든 문자열은 하드코딩하지 않고 `packages/ui/src/i18n/`을 거칩니다.

- `en.ts`가 메시지 키의 원천입니다. 새 문자열은 여기에 먼저 추가되어야 합니다.
- `ko.ts`는 `Record<keyof typeof en, string>` 타입이라 키가 누락되면 타입 에러가 발생합니다.
- 새 언어 추가는 사전 파일 하나 작성 후 `i18n/index.ts`의 `DICTIONARIES`와 `LOCALE_LABELS`에 등록하면 끝입니다.

## 커밋과 PR

- PR 전에 `pnpm test`와 `pnpm typecheck`가 전부 통과해야 합니다.
- 사용자가 보는 동작이 바뀌면 그 내용을 본문에 자세히 작성해주시고, 가능한 경우 `README.md`와 `README_KR.md`를 함께 갱신해주세요.

## 버그 리포트

[GitHub Issues](https://github.com/Quant-TheodoreFelix/agents-devtools/issues)에 올려주세요. 재현 상황을 담은 세션 파일을 첨부하면 가장 좋습니다. UI 헤더의 **내보내기** 버튼으로 문제 순간의 이벤트를 `.ndjson` 파일로 저장할 수 있고, 받는 쪽은 그 파일을 UI에 드래그해 그대로 재생할 수 있습니다. **첨부 전에 payload에 민감한 데이터가 없는지 확인**하세요.

보안 취약점은 공개 이슈에 재현 코드를 전부 싣기보다, 영향 범위만 간단히 알리고 상세 내용은 이메일 <qtfelix@qu4nt.space>을 통해 비공개로 조율하실 수 있습니다.
