import apiHandler from "../src/api-handler.js";
import bundledPersonas from "../src/dj/personas/index.js";

const { createApiServices, handleApiRequest } = apiHandler;
const personaRegistry = new Map((bundledPersonas || []).map((persona) => [persona.id, persona]));

export default {
  async fetch(request, env) {
    const services = createApiServices(env, { personaRegistry });
    const apiResponse = await handleApiRequest(request, services);
    if (apiResponse) return apiResponse;

    return env.ASSETS.fetch(request);
  },
};
