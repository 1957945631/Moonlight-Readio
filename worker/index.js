import apiHandler from "../src/api-handler.js";

const { createApiServices, handleApiRequest } = apiHandler;

export default {
  async fetch(request, env) {
    const services = createApiServices(env);
    const apiResponse = await handleApiRequest(request, services);
    if (apiResponse) return apiResponse;

    return env.ASSETS.fetch(request);
  },
};
