"use server";

import { defineAction } from "./builders/actionBuilder";
import { toServerAction } from "./builders/adapters/serverAction";
import { issueEmailChallenge } from "./stepUp";

const sendStepUpEmailAction = toServerAction(
  defineAction({
    name: "auth.sendStepUpEmail",
    requireVerifiedEmail: true,
    handler: async (ctx) => {
      await issueEmailChallenge(ctx.user, {
        userId: ctx.user.id,
        sessionId: ctx.session.id,
      });
    },
  }),
);

export async function sendStepUpEmail() {
  return sendStepUpEmailAction(undefined);
}
