import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, Unique, OneToMany } from 'typeorm';
import { IntegrationProvider } from './IntegrationProvider';
import type { WorkerDefinitionTool } from './WorkerDefinitionTool';

@Entity()
@Unique(['displayName', 'provider', 'slugName'])
export class Tool {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: "varchar" })
    displayName!: string;

    @Column({ type: "varchar" })
    slugName!: string;

    @Column({ type: "boolean", default: false })
    isModel!: boolean;

    @ManyToOne(() => IntegrationProvider, {
        nullable: true,
        onDelete: 'SET NULL',
    })
    provider!: IntegrationProvider | null;

    @OneToMany('WorkerDefinitionTool', 'tool')
    workerDefinitionTools!: WorkerDefinitionTool[];
}
