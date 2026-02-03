import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Get all music tracks for a user
 */
export async function getMusicTracks(ownerId) {
  try {
    const tracks = await prisma.musicTrack.findMany({
      where: { ownerId },
      orderBy: { type: 'asc' }
    });
    return tracks;
  } catch (error) {
    console.error('Error getting music tracks:', error);
    throw new Error('Failed to get music tracks');
  }
}

/**
 * Create or update a music track
 */
export async function upsertMusicTrack(ownerId, type, filename, url) {
  try {
    const track = await prisma.musicTrack.upsert({
      where: {
        ownerId_type: {
          ownerId,
          type
        }
      },
      update: {
        filename,
        url,
        updatedAt: new Date()
      },
      create: {
        ownerId,
        type,
        filename,
        url
      }
    });
    return track;
  } catch (error) {
    console.error('Error upserting music track:', error);
    throw new Error('Failed to save music track');
  }
}

/**
 * Delete a music track
 */
export async function deleteMusicTrack(id, ownerId) {
  try {
    // Verify ownership before deleting
    const track = await prisma.musicTrack.findUnique({
      where: { id }
    });

    if (!track || track.ownerId !== ownerId) {
      throw new Error('Music track not found or unauthorized');
    }

    await prisma.musicTrack.delete({
      where: { id }
    });

    return track;
  } catch (error) {
    console.error('Error deleting music track:', error);
    throw error;
  }
}
