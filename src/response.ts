import { ISchema, toJoi, toSwagger } from "./ischema";
import * as joi from "joi";
import { registerMethod, registerMiddleware } from "./utils";
import {HTTPStatusCodes, IPath, Tags} from "./index";
import { BaseContext } from "koa";

export interface IResponseOptions {
  devMode?: boolean;
}

const RESPONSES: Map<Function, Map<string, Map<number, ISchema | joi.Schema>>> = new Map();

export const DEFAULT_RESPONSE: joi.Schema = joi.string().default("");

export const response = (code: number, schema?: ISchema | joi.Schema, options: IResponseOptions = {}): MethodDecorator => (target: {}, key: string): void => {
  if (!schema) {
    schema = DEFAULT_RESPONSE;
  }
  if (!RESPONSES.has(target.constructor)) {
    RESPONSES.set(target.constructor, new Map());
  }
  if (!RESPONSES.get(target.constructor).has(key)) {
    RESPONSES.get(target.constructor).set(key, new Map());
  }
  registerMethod(target, key, (router: IPath): void => {
    if (!router.responses) {
      router.responses = {};
    }
    schema = toSwagger(schema);
    let description = "";
    if (schema["description"]) {
      description = schema["description"];
      delete schema["description"];
    }
    router.responses[code] = Object.assign({description}, {schema});
  });

  registerMiddleware(target, key, async (ctx: BaseContext, next: Function): Promise<void> => {
    await next();
    if (options.devMode && RESPONSES.get(target.constructor).get(key).has(ctx.status)) {
      const registerJoiSchema = toJoi(RESPONSES.get(target.constructor).get(key).get(ctx.status));
      const {error, value} = registerJoiSchema.validate(ctx.body);
      if (error) {
        ctx.body = {code: HTTPStatusCodes.internalServerError, message: error.message};
        ctx.status = HTTPStatusCodes.internalServerError;
        return;
      }
      ctx.body = value;
    }
  });

  RESPONSES.get(target.constructor).get(key).set(code, toJoi(schema));
  target[Tags.tagResponse] = target.constructor[Tags.tagResponse] = RESPONSES.get(target.constructor);
};
