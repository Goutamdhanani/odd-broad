import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { UserRole } from '../decorators/roles.decorator';

export interface TenantContext {
  shopId: string;
  userId: string;
  role: UserRole;
}

/**
 * Runs after authentication guards and makes the verified tenant identity
 * available to every downstream handler without trusting request input.
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as Partial<TenantContext> | undefined;

    if (user?.shopId && user.userId && user.role) {
      request.tenant = {
        shopId: user.shopId,
        userId: user.userId,
        role: user.role,
      } satisfies TenantContext;
    }

    return next.handle();
  }
}
