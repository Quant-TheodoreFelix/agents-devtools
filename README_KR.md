# agents-devtools

[![Language](https://img.shields.io/badge/README-English_Ver-blue?style=for-the-badge)](README.md)
[![npm version](https://img.shields.io/npm/v/agents-devtools?style=for-the-badge)](https://www.npmjs.com/package/agents-devtools)
[![npm downloads](https://img.shields.io/npm/dm/agents-devtools?style=for-the-badge)](https://www.npmjs.com/package/agents-devtools)
[![License](https://img.shields.io/npm/l/agents-devtools?style=for-the-badge)](LICENSE)

[Cloudflare Agents SDK](https://github.com/cloudflare/agents)(`agents` npm 패키지)로 만들어진 에이전트를 위한 로컬 DevTools입니다. `wrangler dev` 중 에이전트가 방출하는 구조화 관측성 이벤트를 수집해 웹 UI로 시각화합니다.

다음 기능을 제공합니다.

- 실시간 이벤트 스트림
- 인스턴스별 타임라인
- 채팅 리커버리 검사
- 스케줄 보드
- 연결 라이프사이클
- 세션 녹화·내보내기·재생(NDJSON)

즉, Cloudflare Agents를 위한 React DevTools / Chrome Network 탭 프로젝트입니다.

> [!IMPORTANT]
> 이 도구는 Cloudflare Agents SDK와 함께 동작하는 비공식 커뮤니티 도구입니다. Cloudflare와 제휴하거나 지원받지 않습니다. 이벤트 스키마는 [`cloudflare/agents`](https://github.com/cloudflare/agents)가 공개한 관측성 이벤트를 기반으로 합니다.

![스트림 탭 - 채널 필터와 payload 패널이 있는 실시간 이벤트 스트림](https://raw.githubusercontent.com/Quant-TheodoreFelix/agents-devtools/master/docs/stream.png)

## 빠른 시작

가장 먼저 에이전트에 다음 코드를 추가하세요.

```ts
import { devtools } from "agents-devtools/client";

export class MyAgent extends Agent<Env, State> {
  override observability = devtools();
}
```

이후 `wrangler dev`와 함께 DevTools를 실행하세요.

```sh
$ npx agents-devtools
```

Collector는 `127.0.0.1:4111`에서 대기하고 UI는 `http://127.0.0.1:4110`에서 실행됩니다.

`devtools()`는 SDK 기본 `diagnostics_channel` 방출을 그대로 보존하며 실패에 안전합니다. Collector가 실행 중이 아니어도 에이전트는 영향받지 않습니다(이벤트는 조용히 드롭되고, 반복 실패 후 클라이언트는 스스로 비활성화). 이벤트 전달 방식은 설계상 권장되는 수준으로 구축되었습니다. 이 도구는 감사 로그가 아니라 관측성 도구입니다.

### 호환성

|                | 요구 사항                                                                                                    |
|----------------|----------------------------------------------------------------------------------------------------------|
| `agents`(peer) | `>=0.7.0 <1`                                                                                             |
| 채팅 이벤트 지원      | [`@cloudflare/ai-chat`](https://www.npmjs.com/package/@cloudflare/ai-chat) 필요(SDK 0.20부터 `agents`에서 분리됨) |
| Node.js        | `>=20`                                                                                                   |
| 로컬 런타임         | `wrangler dev` 기준 (배포된 프로덕션 Worker는 Tail Worker가 필요하며 아직 미지원)                                            |
| 브라우저(UI)       | 현재 지원되는 최신 브라우저(Chrome, Firefox, Safari, Edge)                                                           |

`agents@0.20.1`과 `@cloudflare/ai-chat@0.10.1` 기준으로 검증했습니다. 이벤트 스키마는 최대한 상위 호환을 지향합니다. 알 수 없는 이벤트 타입이 와도 UI가 죽지 않고 스트림 탭에 raw JSON으로 표시됩니다.

### 옵트인 상태 스냅샷

`state:update` 이벤트는 기본적으로 빈 payload를 갖습니다. SDK는 에이전트 상태를 관측성 리스너에 노출하지 않습니다. `captureState`를 전달하면 얕고 크기 제한이 걸린 스냅샷을 동봉할 수 있습니다.

```ts
export class MyAgent extends Agent<Env, State> {
  override observability = devtools({ captureState: () => this.state });
}
```

`captureState`는 `state:update` 이벤트에만 호출되며 원본 SDK 동작(`base`)으로 전달되는 이벤트는 절대 변형하지 않습니다. collector로 보내는 사본에만 동봉됩니다. 스냅샷은 얕습니다(중첩된 객체·배열·맵·셋은 재귀하지 않고 `[object]` `[array(n)]`처럼 요약), 긴 문자열은 잘리며, 전체 크기가 수 KB를 넘으면 스냅샷 대신 `{ "[truncated]": true }` 마커로 대체됩니다. 상태에는 민감한 데이터가 있을 수 있으므로 기본값은 꺼짐이며 로컬 디버깅 용도로만 켜야 합니다.

### 녹화와 재생

CLI에 `--record <file>`을 넘기면 collector가 도착하는 이벤트를 NDJSON 세션 파일에 계속 이어 씁니다.

```sh
$ npx agents-devtools --record ./session.ndjson
```

이와 별도로 UI 자체에서도 현재 버퍼를 내보낼 수 있습니다. 헤더의 **내보내기** 버튼이 현재 보이는 이벤트를 `.ndjson` 파일로 다운로드합니다(세션 헤더 한 줄 + 이벤트 봉투 한 줄씩, `--record`가 디스크에 쓰는 것과 같은 형식).

나중에 세션을 다시 보려면 `.ndjson` 파일을 UI에 드래그하세요. 실시간 수신이 멈추고 화면이 녹화 세션으로 전환되며, 배너에 파일 이름이 표시되고 되돌아갈 수 있습니다. **라이브로 복귀**를 누르면 재개되며, 보고 있던 동안 도착한 이벤트를 UI가 다시 채워 넣으므로 그 사이 이벤트도 유실되지 않습니다.

아무것도 가져오지 않고 화면만 멈추려면 헤더의 **일시정지**를 쓰세요. **재개**를 누르면 같은 방식으로 빈 구간을 채웁니다. 옆의 드롭 카운트는 UI가 아니라 collector의 링버퍼 기준입니다. UI가 보기도 전에 이벤트가 밀려나면(버퍼 오버플로) 늘어나며, 일시정지 여부와는 무관합니다.

## 스크린샷

에이전트가 이벤트를 방출하면 곧바로 UI에 나타납니다.

![데모 에이전트 실행 중 실시간으로 채워지는 이벤트 스트림](https://raw.githubusercontent.com/Quant-TheodoreFelix/agents-devtools/master/docs/live.gif)

**타임라인** - 인스턴스별 이벤트 레일과 fiber 실행 스팬(초록 완료, 빨강 실패)

![타임라인 탭](https://raw.githubusercontent.com/Quant-TheodoreFelix/agents-devtools/master/docs/timeline.png)

**채팅** - 접이식 체인으로 묶인 리커버리 인시던트(감지 -> 시도 -> 예약 -> 성공/실패)

![채팅 탭](https://raw.githubusercontent.com/Quant-TheodoreFelix/agents-devtools/master/docs/chat.png)

**스케줄** - 스케줄 id별 카드 보드와 중복 스케줄 경고

![스케줄 탭](https://raw.githubusercontent.com/Quant-TheodoreFelix/agents-devtools/master/docs/schedules.png)

**연결** - 종료 코드와 지속시간이 담긴 WebSocket 라이프사이클

![연결 탭](https://raw.githubusercontent.com/Quant-TheodoreFelix/agents-devtools/master/docs/connections.png)

## 개발

pnpm 모노레포이며, Node 20 이상을 필요로 합니다.

```sh
$ pnpm install
$ pnpm build   # collector CLI와 UI를 빌드
$ pnpm test    # protocol / client / collector 전반의 vitest
```

번들 데모 에이전트로 하는 종단 검증은 다음을 실행하세요.

```sh
# 터미널 1 - DevTools (collector :4111 + UI :4110)
$ node packages/collector/dist/cli.js

# 터미널 2 - 데모 에이전트
$ cd examples/demo-agent && pnpm dev

# 터미널 3 - 이벤트 발생 (rpc, rpc:error, state, schedule, connect/disconnect)
$ cd examples/demo-agent && pnpm exercise
```

이벤트는 매우 빠르게 UI에 나타납니다. DevTools 프로세스를 죽여도 데모 에이전트는 영향받지 않아야 합니다. 이는 설계상 보장 사항이며, exercise 스크립트를 collector 유무 양쪽으로 실행해 확인합니다.

### 디버깅 시나리오 재현

데모에는 mock 스트리밍 모델을 쓰는 채팅 에이전트(`DemoChatAgent`)가 포함되어 있습니다. API 키가 필요 없습니다. 모델 스트림을 강제로 멈추는 테스트 훅이 SDK의 스톨 워치독(`chatStreamStallTimeoutMs: 2000`)과 바운디드 리커버리(`chatRecovery: { maxAttempts: 3, noProgressTimeoutMs: 15000 }`)를 구동합니다.

collector와 `wrangler dev`가 실행 중인 상태(위 터미널 1, 2)에서 다음을 실행하세요.

```sh
$ cd examples/demo-agent
$ pnpm exercise:scenarios s1   # 스트림 스톨 -> 리커버리 체인 (~40초)
$ pnpm exercise:scenarios s2   # 동일 콜백 one-shot 12건 -> schedule:duplicate_warning
$ pnpm exercise:scenarios s4   # 연결 불가 MCP 서버 -> mcp:client:connect 에러
```

- **S1 (채팅 스트림 스톨)** - 첫 턴은 한 번만 멈춰 리커버리가 회복되는 체인(`chat:recovery:detected` -> `attempt` -> `scheduled` -> `completed`)을 만들고, 이어서 매 턴을 멈춰 재시도 런까지 죽는 체인(`chat:recovery:failed`)을 만듭니다. **채팅** 탭에서 각 인시던트가 시도 진행도와 종결 상태를 가진 접이식 체인으로 표시됩니다. 채팅 턴마다 실제 `fiber:run:*` 스팬도 방출되어 **타임라인** 탭에서 볼 수 있습니다. (`@cloudflare/ai-chat` 0.10.1은 워치독 스톨을 별도 `chat:stream:stalled` 이벤트 없이 곧바로 리커버리로 라우팅합니다. 해당 이벤트가 오면 UI는 체인에 함께 렌더합니다.)
- **S2 (스케줄 중복)** - 동일 콜백의 one-shot 스케줄 12건이 한 알람 사이클에 몰리면 SDK가 `schedule:duplicate_warning`으로 경고합니다. **스케줄** 탭에서 id별 카드 위에 콜백 이름과 건수가 담긴 경고 배너가 표시됩니다.
- **S4 (MCP 연결 실패)** - `http://127.0.0.1:9/mcp` 연결이 버전 협상에 실패합니다. **스트림** 탭에서 `mcp` 채널로 필터하면 각 `mcp:client:connect` 이벤트에서 `url`, `transport`, `state: "failed"`, `error`를 확인할 수 있습니다.

`pnpm exercise:fiber`는 타임라인 탭용 합성 fiber 스팬 이벤트를 추가로 주입합니다.

### 배포

`packages/collector`만 `agents-devtools` npm 패키지로 배포됩니다(CLI + UI 번들 + `./client`·`./protocol` 서브패스 export). `protocol` `client` `ui`는 private 워크스페이스 패키지로 남아 빌드 시점에 번들됩니다.

```sh
$ pnpm build                              # ui/dist와 collector/dist를 빌드
$ cd packages/collector
$ npm pack --dry-run                      # 배포 전 tarball 내용 확인
$ pnpm publish --access public            # workspace:* 의존성을 자동으로 치환
```

`pnpm publish`는 먼저 패키지의 `prepack` 스크립트를 실행합니다. 루트의 `LICENSE`와 `README.md`, 빌드된 `packages/ui/dist`를 `packages/collector/`(`ui-dist/`로) 복사해 배포되는 tarball이 자기완결적이 되도록 합니다. 이 복사본들은 git에서 무시되며 pack할 때마다 다시 생성됩니다.

## 라이선스

[MIT](LICENSE).
