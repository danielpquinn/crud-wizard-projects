/**
 * OpenAPI utilities
 */
import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import {
  BodyParameter,
  FormDataParameter,
  HeaderParameter,
  Operation,
  PathParameter,
  QueryParameter,
  Ref,
  Spec
} from "../types/swagger";

export type ResolvedParameter =
  BodyParameter |
  FormDataParameter |
  QueryParameter |
  PathParameter |
  HeaderParameter;

export interface IOperationArguments {
  [key: string]: any;
}

export interface IOperationObjectWithPathAndMethod {
  method: string;
  path: string;
  operation: Operation;
}

export const findOperationObject = (spec: Spec, operationId: string): IOperationObjectWithPathAndMethod | null => {
  for (const path in spec.paths) {
    if (spec.paths[path]) {
      for (const method in spec.paths[path]) {
        if (spec.paths[path][method].operationId === operationId) {
          return {
            method,
            operation: spec.paths[path][method],
            path
          }
        }
      }
    }
  }
  return null;
};

const isArray = (item: any): boolean => {
  return Array.isArray(item);
};

const isObject = (item: any): boolean => {
  return typeof item === "object";
};

const isArrayOrObject = (item: any): boolean => {
  return isArray(item) || isObject(item);
};

export const resolveAllReferences = (spec: Spec): Spec => {
  const resolved = {};

  const queue: any[] = [];
  const resolvedQueue: any[] = [];

  queue.push(spec);
  resolvedQueue.push(resolved);

  while (queue.length > 0) {
    const node = queue.shift();
    const resolvedNode = resolvedQueue.shift();

    if (isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        const item = node[i];
        if (isArray(item)) {
          resolvedNode[i] = [];
        } else if (isObject(item)) {
          resolvedNode[i] = {};
        } else {
          resolvedNode[i] = item;
        }
        if (isArrayOrObject(item)) {
          queue.push(item);
          resolvedQueue.push(resolvedNode[i]);
        }
      }
    } else if (isObject(node)) {
      for (const key in node) {
        if (node[key]) {
          const item = node[key];
          if (isArray(item)) {
            resolvedNode[key] = [];
          } else if (isObject(item)) {
            resolvedNode[key] = {};
          } else {
            resolvedNode[key] = item;
          }
          if (isArrayOrObject(item)) {
            queue.push(item);
            resolvedQueue.push(resolvedNode[key]);
          }
        }
      }
    }
  }

  resolvedQueue.push(resolved);

  while (resolvedQueue.length > 0) {
    const node = resolvedQueue.shift();

    if (isArray(node)) {
      for (let i = 0; i < node.length; i += 1) {
        const item = node[i];
        if (isArrayOrObject(item)) {
          node[i] = resolveReference(resolved as Spec, item);
          resolvedQueue.push(item);
        }
      }
    } else if (isObject(node)) {
      for (const key in node) {
        if (node[key]) {
          node[key] = resolveReference(resolved as Spec, node[key]);
          if (isArrayOrObject(node[key])) {
            resolvedQueue.push(node[key]);
          }
        }
      }
    }
  }

  return resolved as Spec;
};

export const resolveReference = <RefType>(spec: Spec, value: RefType | Ref): RefType => {
  const referenceObject: Ref = value as Ref;
  if (referenceObject.$ref) {
    let result: any = spec;
    const path = referenceObject.$ref.substring(2, referenceObject.$ref.length).split("/");
    for (const segment of path) {
      if (result[segment]) {
        result = result[segment];
        if (result.$ref) { result = spec; }
      }
    }
    return result as RefType;
  }
  return value as RefType;
}

export const operationArgsInterceptors: Array<((spec: Spec, operationId: string, args: IOperationArguments) => Promise<IOperationArguments>)> = [];
export const operationResponseInterceptors: Array<((spec: Spec, operationId: string, response: AxiosResponse) => Promise<AxiosResponse>)> = [];

export const operate = async (spec: Spec, operationId: string, args: IOperationArguments): Promise<AxiosResponse> => {
  const operation = findOperationObject(spec, operationId);
  if (!operation) { throw new Error(`Could not find operation with ID ${operationId}`); }
  let url = new URL(`https://${spec.host}${spec.basePath}${operation.path}`);

  const interceptedArguments = await operationArgsInterceptors.reduce(async (previousValue, interceptor) => {
    const prev = await previousValue;
    return interceptor(spec, operationId, prev);
  }, Promise.resolve(args));

  const options: AxiosRequestConfig = {
    headers: { "Content-Type": "application/json" },
    method: operation.method,
  };

  if (operation.operation.parameters) {
    let path = operation.path;
    const resolvedParams = operation.operation.parameters.map(param => resolveReference(spec, param));
    const pathParams = resolvedParams.filter(param => param && param.in === "path");
    const queryParams = resolvedParams.filter(param => param && param.in === "query");
    const bodyParams = resolvedParams.filter(param => param && param.in === "body");

    pathParams.forEach(param => {
      if (!param) { return; }
      const argument = interceptedArguments[param.name];
      if (argument) {
        path = path.replace(`{${param.name}}`, encodeURIComponent(argument));
      }
    });

    url = new URL(`https://${spec.host}${spec.basePath}${path}`);

    queryParams.forEach(param => {
      if (!param) { return; }
      const argument = interceptedArguments[param.name];
      if (argument) {
        url.searchParams.append(param.name, argument);
      }
    });

    bodyParams.forEach(param => {
      if (!param) { return; }
      options.data = interceptedArguments[param.name];
    });
  }

  options.url = url.href;

  try {
    const response = await axios(options);
    const interceptedResponse = await operationResponseInterceptors.reduce(async (prevValue, interceptor) => {
      await prevValue;
      return interceptor(spec, operationId, response);
    }, Promise.resolve(response));
    return interceptedResponse;
  } catch (e) {
    // tslint:disable:no-console
    console.error(e);
    const response = e.response;
    return response;
  }
};