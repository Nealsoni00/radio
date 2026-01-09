import { getCalls, getCall, getCallSources } from '../../db/index.js';
export async function callRoutes(app) {
    // Get recent calls with pagination and filters
    app.get('/api/calls', async (request, reply) => {
        const { limit, offset, talkgroup, since, emergency } = request.query;
        const calls = getCalls({
            limit: limit ? parseInt(limit, 10) : 50,
            offset: offset ? parseInt(offset, 10) : 0,
            talkgroupId: talkgroup ? parseInt(talkgroup, 10) : undefined,
            since: since ? parseInt(since, 10) : undefined,
            emergency: emergency === 'true' ? true : emergency === 'false' ? false : undefined,
        });
        return { calls };
    });
    // Get single call with sources
    app.get('/api/calls/:id', async (request, reply) => {
        const { id } = request.params;
        const call = getCall(id);
        if (!call) {
            return reply.status(404).send({ error: 'Call not found' });
        }
        const sources = getCallSources(id);
        return { call, sources };
    });
}
//# sourceMappingURL=calls.js.map