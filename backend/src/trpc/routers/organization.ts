import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import { authedProcedure, router } from '../trpc';
import { AppDataSource } from '../../db/data-source';
import { Organization } from '../../db/entities/Organization';
import { getOrganizationMembers } from '../../services/organizationService';

export const organizationRouter = router({
    get: authedProcedure.query(async ({ ctx }) => {
        return {
            id: ctx.organization.id,
            name: ctx.organization.name,
            workosOrganizationId: ctx.organization.workosOrganizationId,
        };
    }),

    updateName: authedProcedure.input(z.object({ name: z.string().min(1).max(200) })).mutation(async ({ ctx, input }) => {
        const orgRepo = AppDataSource.getRepository(Organization);
        const org = await orgRepo.findOne({
            where: { id: ctx.organization.id },
        });

        if (!org) {
            throw new TRPCError({ code: 'NOT_FOUND' });
        }

        org.name = input.name;
        await orgRepo.save(org);

        return { success: true, name: org.name };
    }),

    listMembers: authedProcedure.query(async ({ ctx }) => {
        const members = await getOrganizationMembers(ctx.organization.id);

        return members.map((member) => ({
            id: member.id,
            userId: member.userId,
            email: member.userEmail,
            role: member.role,
            createdAt: member.createdAt,
        }));
    }),
});
