import { z } from "zod";
import {
  CallbackManager,
  CallbackManagerForToolRun,
  Callbacks,
} from "../callbacks/manager.js";
import { BaseLangChain, BaseLangChainParams } from "../base_language/index.js";

export interface ToolParams extends BaseLangChainParams {
  /**
   * @deprecated Use `callbacks` instead
   */
  callbackManager?: CallbackManager;
}

export abstract class StructuredTool<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  T extends z.ZodObject<any, any, any, any> = z.ZodObject<any, any, any, any>
> extends BaseLangChain {
  abstract schema: T | z.ZodEffects<T>;

  constructor(verbose?: boolean, callbacks?: Callbacks) {
    super({ verbose, callbacks });
  }

  protected abstract _call(
    arg: z.output<T>,
    callbackManager?: CallbackManagerForToolRun
  ): Promise<string>;

  async call(
    arg: (z.output<T> extends string ? string : never) | z.input<T>,
    callbacks?: Callbacks
  ): Promise<string> {
    const parsed = await this.schema.parseAsync(arg);
    const callbackManager_ = await CallbackManager.configure(
      callbacks,
      this.callbacks,
      { verbose: this.verbose }
    );
    const runManager = await callbackManager_?.handleToolStart(
      { name: this.name },
      typeof parsed === "string" ? parsed : JSON.stringify(parsed)
    );
    let result;
    try {
      result = await this._call(parsed, runManager);
    } catch (e) {
      await runManager?.handleToolError(e);
      throw e;
    }
    await runManager?.handleToolEnd(result);
    return result;
  }

  abstract name: string;

  abstract description: string;

  returnDirect = false;
}

export abstract class Tool extends StructuredTool {
  schema = /* #__PURE__ */ z
    // eslint-disable-next-line tree-shaking/no-side-effects-in-initialization
    .object({ input: /* #__PURE__ */ z.string().optional() })
    // eslint-disable-next-line tree-shaking/no-side-effects-in-initialization
    /* #__PURE__ */ .transform((obj) => obj.input);

  call(
    arg: string | undefined | z.input<this["schema"]>,
    callbacks?: Callbacks
  ): Promise<string> {
    return super.call(
      typeof arg === "string" || !arg ? { input: arg } : arg,
      callbacks
    );
  }
}
