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

## 라이선스

[MIT](LICENSE).
