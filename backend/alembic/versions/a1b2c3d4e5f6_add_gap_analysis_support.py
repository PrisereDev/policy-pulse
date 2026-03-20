"""Add gap analysis support

Revision ID: a1b2c3d4e5f6
Revises: f048a3c787a4
Create Date: 2026-03-20

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'a1b2c3d4e5f6'
down_revision = 'f048a3c787a4'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('analysis_jobs', sa.Column(
        'job_type', sa.String(length=50), server_default='policy_comparison', nullable=False
    ))
    op.add_column('analysis_jobs', sa.Column(
        'risk_profile_data', postgresql.JSON(astext_type=sa.Text()), nullable=True
    ))
    op.alter_column('analysis_jobs', 'renewal_s3_key',
                     existing_type=sa.String(length=500), nullable=True)
    op.alter_column('analysis_jobs', 'renewal_filename',
                     existing_type=sa.String(length=255), nullable=True)


def downgrade() -> None:
    op.alter_column('analysis_jobs', 'renewal_filename',
                     existing_type=sa.String(length=255), nullable=False)
    op.alter_column('analysis_jobs', 'renewal_s3_key',
                     existing_type=sa.String(length=500), nullable=False)
    op.drop_column('analysis_jobs', 'risk_profile_data')
    op.drop_column('analysis_jobs', 'job_type')
