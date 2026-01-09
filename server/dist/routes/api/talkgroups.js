import { getTalkgroups, getTalkgroup } from '../../db/index.js';
export async function talkgroupRoutes(app) {
    // Get all talkgroups
    app.get('/api/talkgroups', async () => {
        const talkgroups = getTalkgroups();
        return { talkgroups };
    });
    // Get single talkgroup
    app.get('/api/talkgroups/:id', async (request, reply) => {
        const { id } = request.params;
        const talkgroup = getTalkgroup(parseInt(id, 10));
        if (!talkgroup) {
            return reply.status(404).send({ error: 'Talkgroup not found' });
        }
        return { talkgroup };
    });
}
//# sourceMappingURL=talkgroups.js.map