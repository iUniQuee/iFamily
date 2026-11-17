import { handle, scheduled } from './src/app.js';

export default {
  fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },
  scheduled(event, env, ctx) {
    return scheduled(env, ctx);
  }
};
