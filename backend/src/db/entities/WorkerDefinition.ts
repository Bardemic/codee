import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index, OneToMany } from 'typeorm';
import type { WorkerDefinitionTool } from './WorkerDefinitionTool';

@Entity()
@Index(['slug', 'userId'], { unique: true })
export class WorkerDefinition {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ length: 200 })
    prompt!: string;

    @Column()
    userId!: string;

    @CreateDateColumn()
    createdAt!: Date;

    @Column({ length: 200 })
    slug!: string;

    @Column({ nullable: true })
    key!: string | null;

    @Column({ type: 'jsonb', default: [] })
    cloudProviders!: Array<Record<string, unknown>>;

    @OneToMany('WorkerDefinitionTool', 'workerDefinition')
    tools!: WorkerDefinitionTool[];
}
