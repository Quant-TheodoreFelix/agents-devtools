# agents-devtools

[![Language](https://img.shields.io/badge/README-English_Ver-blue?style=for-the-badge)](README.md)

[Cloudflare Agents SDK](https://github.com/cloudflare/agents)(`agents` npm 패키지)로 만들어진 에이전트를 위한 로컬 DevTools입니다. `wrangler dev` 중 에이전트가 방출하는 구조화 관측성 이벤트를 수집해 웹 UI로 시각화합니다.

다음 기능을 제공합니다.

- 실시간 이벤트 스트림
- 인스턴스별 타임라인
- 채팅 리커버리 검사
- 스케줄 보드
- 연결 라이프사이클

즉, Cloudflare Agents를 위한 React DevTools / Chrome Network 탭 프로젝트입니다.

> [!IMPORTANT]
> 이 도구는 Cloudflare Agents SDK와 함께 동작하는 비공식 커뮤니티 도구입니다. Cloudflare와 제휴하거나 지원받지 않습니다. 이벤트 스키마는 [`cloudflare/agents`](https://github.com/cloudflare/agents)가 공개한 관측성 이벤트를 기반으로 합니다.

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

## 라이선스

[MIT](LICENSE).
