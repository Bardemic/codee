import { workos } from '../auth/auth';
import { AppDataSource } from '../db/data-source';
import { Organization } from '../db/entities/Organization';
import { OrganizationMember, MemberRole } from '../db/entities/OrganizationMember';

export async function ensureUserHasOrganization(user: { id: string; email: string; firstName?: string | null; lastName?: string | null }) {
    const orgMemberRepo = AppDataSource.getRepository(OrganizationMember);

    // Check if user already has organization membership
    const existingMembership = await orgMemberRepo.findOne({
        where: { userId: user.id },
        relations: ['organization'],
    });

    if (existingMembership) {
        return existingMembership.organization;
    }

    // Create new organization in WorkOS
    const workosOrg = await workos.organizations.createOrganization({
        name: `${user.firstName || user.email}'s Workspace`,
    });

    // Create organization in local database
    const orgRepo = AppDataSource.getRepository(Organization);
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const organization = orgRepo.create({
        workosOrganizationId: workosOrg.id,
        name: 'Personal Workspace',
        billingPeriodStart: now,
        billingPeriodEnd: periodEnd,
    });
    await orgRepo.save(organization);

    // Create organization membership
    const membership = orgMemberRepo.create({
        userId: user.id,
        organizationId: organization.id,
        userEmail: user.email,
        role: MemberRole.OWNER,
    });
    await orgMemberRepo.save(membership);

    // Create WorkOS organization membership
    await workos.userManagement.createOrganizationMembership({
        userId: user.id,
        organizationId: workosOrg.id,
    });

    return organization;
}

export async function getUserOrganization(userId: string): Promise<Organization | null> {
    const orgMemberRepo = AppDataSource.getRepository(OrganizationMember);

    const membership = await orgMemberRepo.findOne({
        where: { userId },
        relations: ['organization'],
    });

    return membership?.organization || null;
}

export async function getOrganizationMembers(organizationId: number) {
    const orgMemberRepo = AppDataSource.getRepository(OrganizationMember);

    return orgMemberRepo.find({
        where: { organizationId },
        order: { createdAt: 'ASC' },
    });
}

export async function getOrganizationIdByUserId(userId: string): Promise<number | null> {
    const orgMemberRepo = AppDataSource.getRepository(OrganizationMember);

    const membership = await orgMemberRepo.findOne({
        where: { userId },
    });

    return membership?.organizationId || null;
}
