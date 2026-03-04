import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../db.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireChannelMembership } from '../middleware/authorize.js';
import { AuthRequest } from '../types.js';
import { USER_SELECT_BASIC, FILE_SELECT, MESSAGE_INCLUDE_FULL, MESSAGE_INCLUDE_WITH_FILES } from '../db/selects.js';
import { parsePagination, paginateResults } from '../utils/pagination.js';

const router = Router();

const createMessageSchema = z.object({
  content: z.string()
    .min(1)
    .max(4000)
    .refine(
      (val) => val.trim().length > 0,
      { message: 'Message content cannot be empty or whitespace only' }
    )
    .refine(
      (val) => !val.includes('\u0000'),
      { message: 'Message content cannot contain null bytes' }
    ),
  threadId: z.number().optional(),
  fileIds: z.array(z.number()).optional(),
});

// POST /channels/:id/messages - Send message
router.post('/:id/messages', authMiddleware, requireChannelMembership, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.channelId!;
    const userId = req.user!.userId;
    const { content, threadId, fileIds } = createMessageSchema.parse(req.body);

    // Validate threadId belongs to the same channel (prevent cross-channel thread injection)
    if (threadId) {
      const parentMessage = await prisma.message.findUnique({
        where: { id: threadId },
      });
      if (!parentMessage || parentMessage.channelId !== channelId) {
        res.status(400).json({ error: 'Thread parent must belong to the same channel' });
        return;
      }
    }

    // Validate fileIds belong to the user and are not already attached
    if (fileIds && fileIds.length > 0) {
      const files = await prisma.file.findMany({
        where: {
          id: { in: fileIds },
          userId,
          messageId: null, // Only unattached files
        },
      });

      if (files.length !== fileIds.length) {
        res.status(400).json({ error: 'Invalid file IDs or files already attached' });
        return;
      }
    }

    const message = await prisma.message.create({
      data: {
        content,
        userId,
        channelId,
        threadId,
      },
      include: MESSAGE_INCLUDE_WITH_FILES,
    });

    // Attach files to the message
    if (fileIds && fileIds.length > 0) {
      await prisma.file.updateMany({
        where: { id: { in: fileIds }, userId },
        data: { messageId: message.id },
      });

      // Fetch updated message with files
      const updatedMessage = await prisma.message.findUnique({
        where: { id: message.id },
        include: MESSAGE_INCLUDE_WITH_FILES,
      });

      res.status(201).json(updatedMessage);
      return;
    }

    res.status(201).json(message);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.issues });
      return;
    }
    console.error('Send message error:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// GET /channels/:id/messages - Get messages (paginated)
router.get('/:id/messages', authMiddleware, requireChannelMembership, async (req: AuthRequest, res: Response) => {
  try {
    const channelId = req.channelId!;
    const { limit, cursor } = parsePagination(req);

    const messages = await prisma.message.findMany({
      where: {
        channelId,
        threadId: null, // Only get top-level messages
        deletedAt: null, // Exclude deleted messages
      },
      include: {
        ...MESSAGE_INCLUDE_FULL,
        replies: {
          select: {
            user: {
              select: { id: true, name: true, avatar: true },
            },
          },
          distinct: ['userId'],
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1,
      }),
    });

    const { results: resultMessages, nextCursor, hasMore } = paginateResults(messages, limit);

    // Extract unique thread participants from replies
    const enrichedMessages = resultMessages.map((msg) => {
      const { replies, ...rest } = msg;
      const threadParticipants = replies
        ? replies.map((r: { user: { id: number; name: string; avatar: string | null } }) => r.user)
        : [];
      return { ...rest, threadParticipants };
    });

    res.json({
      messages: enrichedMessages,
      nextCursor,
      hasMore,
    });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
});

export default router;
