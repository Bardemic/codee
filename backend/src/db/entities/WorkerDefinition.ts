import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, OneToMany, ManyToOne } from 'typeorm';
import type { WorkerDefinitionTool } from './WorkerDefinitionTool';
import type { Organization } from './Organization';

@Entity()
@Index(['slug', 'organizationId'], { unique: true })
export class WorkerDefinition {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: 'varchar', nullable: true,  length: 200 })
    prompt!: string;

    @Column({ type: 'varchar' })
    organizationId!: number;

    @ManyToOne('Organization', {
        onDelete: 'CASCADE',
    })
    organization!: Organization;

    @CreateDateColumn()
    createdAt!: Date;

    @Column({ type: 'varchar', nullable: true,  length: 200 })
    slug!: string;

    @Column({ type: 'varchar', nullable: true })
    key!: string | null;

    @Column({ type: 'jsonb', default: [] })
    cloudProviders!: Array<Record<string, unknown>>;

    @OneToMany('WorkerDefinitionTool', 'workerDefinition')
    tools!: WorkerDefinitionTool[];
}
