import { FastifyPluginAsync } from 'fastify';

export const courseRoutes: FastifyPluginAsync = async (fastify) => {
  // List all courses
  fastify.get('/courses', async () => {
    return fastify.repos.course.findAll();
  });

  // Get all courses with nested media (tree view)
  fastify.get('/courses/tree', async () => {
    return fastify.repos.course.findAllWithMedia();
  });

  // Get course detail with ordered media
  fastify.get<{ Params: { id: string } }>('/courses/:id', async (req, reply) => {
    const course = await fastify.repos.course.findById(req.params.id);
    if (!course) return reply.code(404).send({ error: 'course not found' });
    const media = await fastify.repos.course.getMedia(req.params.id);
    return { ...course, media };
  });

  // Create course
  fastify.post<{ Body: { title: string; description?: string } }>(
    '/courses',
    async (req, reply) => {
      const id = crypto.randomUUID();
      try {
        return await fastify.repos.course.create({
          id,
          title: req.body.title,
          description: req.body.description,
        });
      } catch (err) {
        fastify.log.error({ err, courseId: id }, 'Failed to create course');
        return reply.code(500).send({ error: 'Internal error — failed to create course' });
      }
    },
  );

  // Update course metadata
  fastify.put<{ Params: { id: string }; Body: { title?: string; description?: string } }>(
    '/courses/:id',
    async (req, reply) => {
      const existing = await fastify.repos.course.findById(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'course not found' });
      try {
        return await fastify.repos.course.update(req.params.id, req.body);
      } catch (err) {
        fastify.log.error({ err, courseId: req.params.id }, 'Failed to update course');
        return reply.code(500).send({ error: 'Internal error — failed to update course' });
      }
    },
  );

  // Delete course (also deletes media that would become orphans)
  fastify.delete<{ Params: { id: string } }>('/courses/:id', async (req, reply) => {
    const existing = await fastify.repos.course.findById(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'course not found' });
    try {
      const deletedMediaIds = await fastify.repos.course.delete(req.params.id);
      if (deletedMediaIds.length > 0) {
        fastify.log.info(
          { courseId: req.params.id, deletedMediaIds },
          'Deleted orphaned media during course deletion',
        );
      }
      return { ok: true, deletedMediaIds };
    } catch (err) {
      fastify.log.error({ err, courseId: req.params.id }, 'Failed to delete course');
      return reply.code(500).send({ error: 'Internal error — failed to delete course' });
    }
  });

  // Add media to course
  fastify.post<{ Params: { id: string }; Body: { mediaId: string } }>(
    '/courses/:id/media',
    async (req, reply) => {
      const course = await fastify.repos.course.findById(req.params.id);
      if (!course) return reply.code(404).send({ error: 'course not found' });
      const media = await fastify.repos.media.findById(req.body.mediaId);
      if (!media) return reply.code(404).send({ error: 'media not found' });
      try {
        await fastify.repos.course.addMedia(req.params.id, req.body.mediaId);
        return { ok: true };
      } catch (err) {
        fastify.log.error(
          { err, courseId: req.params.id, mediaId: req.body.mediaId },
          'Failed to add media to course',
        );
        return reply.code(500).send({ error: 'Internal error — failed to add media to course' });
      }
    },
  );

  // Remove media from course (prevents orphaning)
  fastify.delete<{ Params: { id: string; mediaId: string } }>(
    '/courses/:id/media/:mediaId',
    async (req, reply) => {
      // SQLite serializes writes so the count-then-delete is safe here.
      // WARNING: if this ever runs against a multi-writer backend, wrap in a transaction.
      const count = await fastify.repos.course.countCoursesForMedia(req.params.mediaId);
      if (count <= 1) {
        return reply.code(409).send({ error: 'Cannot remove media from its last course' });
      }
      try {
        await fastify.repos.course.removeMedia(req.params.id, req.params.mediaId);
        return { ok: true };
      } catch (err) {
        fastify.log.error(
          { err, courseId: req.params.id, mediaId: req.params.mediaId },
          'Failed to remove media from course',
        );
        return reply
          .code(500)
          .send({ error: 'Internal error — failed to remove media from course' });
      }
    },
  );

  // Reorder media in course
  fastify.patch<{ Params: { id: string }; Body: { orderedMediaIds: string[] } }>(
    '/courses/:id/media/order',
    async (req, reply) => {
      try {
        await fastify.repos.course.updateMediaOrder(req.params.id, req.body.orderedMediaIds);
        return { ok: true };
      } catch (err) {
        fastify.log.error({ err, courseId: req.params.id }, 'Failed to reorder media in course');
        return reply.code(500).send({ error: 'Internal error — failed to reorder media' });
      }
    },
  );
};
