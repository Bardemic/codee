import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique, OneToMany } from 'typeorm';
import { IntegrationProvider } from './IntegrationProvider';
import type { WorkerDefinitionTool } from './WorkerDefinitionTool';

@Entity()
@Unique(['displayName', 'provider', 'slugName'])
export class Tool {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    displayName!: string;

    @Column()
    slugName!: string;

    @Column({ default: false })
    isModel!: boolean;

    @ManyToOne(() => IntegrationProvider, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    provider!: IntegrationProvider | null;

    @OneToMany('WorkerDefinitionTool', 'tool')
    workerDefinitionTools!: WorkerDefinitionTool[];
}
