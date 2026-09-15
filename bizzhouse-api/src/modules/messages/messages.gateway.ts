import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  },
  namespace: '/inbox',
})
export class MessagesGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MessagesGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        (client.handshake.headers?.authorization as string)?.replace('Bearer ', '');

      if (!token) {
        client.disconnect();
        return;
      }

      const payload = this.jwtService.verify(token);
      const shopId = payload.shopId;

      if (payload.role === 'super_admin') {
        client.join('admin');
        (client as any).data = { role: 'super_admin', userId: payload.sub };
        this.logger.log(`Admin client connected: user=${payload.sub}`);
        return;
      }

      if (!shopId) {
        client.disconnect();
        return;
      }

      client.join(`shop:${shopId}`);
      (client as any).data = { shopId, userId: payload.sub };

      this.logger.log(`Client connected: user=${payload.sub} shop=${shopId}`);
    } catch (err: any) {
      this.logger.warn(`WebSocket auth failed: ${err?.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: user=${(client as any).data?.userId}`);
  }

  emitNewMessage(shopId: string, message: any) {
    this.server.to(`shop:${shopId}`).emit('message:new', message);
  }

  emitMessageStatus(shopId: string, update: { messageId: string; status: string }) {
    this.server.to(`shop:${shopId}`).emit('message:status', update);
  }

  emitBroadcastUpdate(shopId: string, update: any) {
    this.server.to(`shop:${shopId}`).emit('broadcast:update', update);
  }
}
