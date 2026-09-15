import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantContext } from '../interceptors/tenant-context.interceptor';

export const CurrentTenant = createParamDecorator(
  (data: keyof TenantContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const tenant = request.tenant as TenantContext | undefined;
    return data ? tenant?.[data] : tenant;
  },
);
