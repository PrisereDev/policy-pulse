from pydantic import BaseModel, EmailStr, Field

class Datum(BaseModel):
    """location: -> Where is the business located?"""
    location: str
    """climate: Does your inventory require constant refrigeration or climate control?"""
    climate: bool
    """events: Do clients pay you for professional advice, designs, or technical services?"""
    events: bool
    """How do you handle customer data and payments?** | - Mostly digital/online<br>- Mostly in-person/cash | If Digital → **Recommend: Cyber Insurance**. Covers recovery and legal costs from hacks/breaches. |"""
    payments: bool
    