import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import dataSource from './data-source';
import { User } from '../modules/auth/entities/user.entity';

async function seedAdmin() {
  const email = process.env.DEFAULT_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DEFAULT_ADMIN_PASSWORD;
  const name = process.env.DEFAULT_ADMIN_NAME?.trim() || 'Platform Admin';

  if (!email || !password) {
    throw new Error(
      'DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD must be set before seeding an admin.',
    );
  }

  await dataSource.initialize();
  try {
    const users = dataSource.getRepository(User);
    const existing = await users.findOneBy({ email });

    if (existing) {
      if (existing.role !== 'super_admin') {
        throw new Error(`A non-admin user already exists for ${email}. Choose another email.`);
      }
      console.log(`Platform admin already exists: ${email}`);
      return;
    }

    await users.save(
      users.create({
        email,
        passwordHash: await bcrypt.hash(password, 12),
        name,
        role: 'super_admin',
        shopId: null,
      }),
    );
    console.log(`Platform admin created: ${email}`);
  } finally {
    await dataSource.destroy();
  }
}

seedAdmin().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
