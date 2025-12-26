import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, CreateDateColumn, UpdateDateColumn, Unique } from 'typeorm';
import { IntegrationProvider } from './IntegrationProvider';
import { decryptData, encryptData } from '../../utils/encryption';

@Entity()
@Unique(['userId', 'provider', 'externalId'])
export class IntegrationConnection {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    userId!: string;

    @ManyToOne(() => IntegrationProvider, {
        onDelete: 'CASCADE',
    })
    provider!: IntegrationProvider;

    @Column({ default: '' })
    externalId!: string;

    @Column({ type: 'jsonb', default: {} })
    data!: Record<string, string>;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;

    setDataConfig(input: Record<string, string | undefined>) {
        const encrypted: Record<string, string> = {};
        for (const key of Object.keys(input)) {
            const value = input[key];
            if (value !== undefined) {
                encrypted[key] = encryptData(value);
            }
        }
        this.data = encrypted;
    }

    getDataConfig(): Record<string, string> {
        const decrypted: Record<string, string> = {};
        const data = this.data || {};
        for (const key of Object.keys(data)) {
            const value = data[key];
            if (value !== undefined) {
                decrypted[key] = decryptData(value);
            }
        }
        return decrypted;
    }
}
