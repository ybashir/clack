import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import prisma from '../db.js';
import { JWT_SECRET, GOOGLE_CLIENT_ID } from '../config.js';
import { logError } from '../utils/logger.js';

const router = Router();
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const googleAuthSchema = z.object({
  credential: z.string().min(1),
});

// Auto-join default channels for a new user
async function autoJoinChannels(userId: number, role: string) {
  const channelsToJoin = role === 'GUEST' ? ['general'] : ['general', 'random'];
  for (const channelName of channelsToJoin) {
    try {
      let channel = await prisma.channel.findFirst({
        where: { name: channelName, isPrivate: false },
      });
      if (!channel) {
        try {
          channel = await prisma.channel.create({
            data: { name: channelName, isPrivate: false },
          });
        } catch {
          channel = await prisma.channel.findFirst({
            where: { name: channelName, isPrivate: false },
          });
        }
      }
      if (channel) {
        await prisma.channelMember.create({
          data: { userId, channelId: channel.id },
        }).catch(() => {});
      }
    } catch {
      // Non-critical: don't fail if auto-join fails
    }
  }
}

// POST /auth/google
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { credential } = googleAuthSchema.parse(req.body);

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.email_verified) {
      res.status(401).json({ error: 'Invalid or unverified Google account' });
      return;
    }

    const { sub: googleId, email, name, picture } = payload;

    // Find existing user by googleId or email
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId }, { email }] },
    });

    if (user) {
      if (user.deactivatedAt) {
        res.status(401).json({ error: 'Account is deactivated' });
        return;
      }
      // Link Google account if found by email but not yet linked
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            googleId,
            ...(picture && !user.avatar ? { avatar: picture } : {}),
          },
        });
      }
    } else {
      // Create new user
      user = await prisma.user.create({
        data: {
          email,
          googleId,
          name: name || email.split('@')[0],
          avatar: picture || null,
          password: null,
          role: 'MEMBER',
        },
      });
      await autoJoinChannels(user.id, 'MEMBER');
    }

    const token = jwt.sign({ userId: user.id, tokenVersion: user.tokenVersion }, JWT_SECRET, {
      algorithm: 'HS256',
      expiresIn: '7d',
    });

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        createdAt: user.createdAt,
      },
      token,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    logError('Google auth error', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// POST /auth/test-login — Dev/test only: login by email without Google
if (process.env.NODE_ENV !== 'production') {
  const testLoginSchema = z.object({
    email: z.string().email(),
    name: z.string().optional(),
  });

  router.post('/test-login', async (req: Request, res: Response) => {
    try {
      const { email, name } = testLoginSchema.parse(req.body);

      let user = await prisma.user.findUnique({ where: { email } });

      if (!user) {
        // Auto-create for tests
        user = await prisma.user.create({
          data: {
            email,
            name: name || email.split('@')[0],
            password: null,
            role: 'MEMBER',
          },
        });
        await autoJoinChannels(user.id, 'MEMBER');
      }

      if (user.deactivatedAt) {
        res.status(401).json({ error: 'Account is deactivated' });
        return;
      }

      const token = jwt.sign({ userId: user.id, tokenVersion: user.tokenVersion }, JWT_SECRET, {
        algorithm: 'HS256',
        expiresIn: '7d',
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          role: user.role,
          createdAt: user.createdAt,
        },
        token,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: error.issues });
        return;
      }
      logError('Test login error', error);
      res.status(500).json({ error: 'Test login failed' });
    }
  });
}

export default router;
