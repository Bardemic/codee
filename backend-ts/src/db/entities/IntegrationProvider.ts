import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Unique } from 'typeorm';

@Entity()
@Unique(['slug'])
export class IntegrationProvider {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    slug!: string;

    @Column()
    displayName!: string;

    @Column({ default: false })
    hasCloudAgent!: boolean;

    @Column({ type: 'jsonb', default: {} })
    schema!: Record<string, unknown>;

    @CreateDateColumn()
    createdAt!: Date;
}
