
"""Join the WhatsApp scheduling and secretarial ticket migration histories."""

revision: str = "j67a2b3c4d5e"
down_revision: tuple[str, str] = ("h1a2b3c4d5e6", "i13a2b3c4d5e")
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
