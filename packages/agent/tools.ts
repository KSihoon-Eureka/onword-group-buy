/**
 * @onword/agent 패키지 root entry.
 *
 * 실제 registry / handler / schema 는 ./tools/index.ts.
 * Phase C.5 부터는 orchestrator 가 ./tools/index 를 직접 import 한다.
 *
 * 본 파일은 외부 패키지에서 `@onword/agent` 로 root import 했을 때를 위한 thin re-export.
 */

export {
  TOOL_REGISTRY,
  TOOL_NAMES,
  TOOL_SCHEMAS,
  PHASE_D_PLACEHOLDER,
  mockHandler,
  makeHandler,
  type ToolContext,
  type ToolHandler,
} from './tools/index'
