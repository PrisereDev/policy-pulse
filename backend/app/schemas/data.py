from pydantic import BaseModel, Field

class Datum(BaseModel):
    """Schema for the 5-question business risk assessment."""
    location: str = Field(..., description="Where is the business located?")
    climate: bool = Field(..., description="Does inventory require refrigeration or climate control?")
    events: bool = Field(..., description="Do clients pay for professional advice, designs, or technical services?")
    errors_and_omissions: bool = Field(..., description="Does the business have E&O coverage?")
    payments: bool = Field(..., description="Does the business handle customer data and payments digitally?")
    