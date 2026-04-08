from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

from guardrails import Guard
from guardrails.hub import DetectPII

input_safety = Guard(name="input-safety")
input_safety.use(DetectPII(pii_entities=["EMAIL_ADDRESS", "PHONE_NUMBER"], on_fail="exception"))

app = FastAPI()


class ValidateRequest(BaseModel):
    llmOutput: str


@app.post("/guards/{guard_name}/validate")
def validate(guard_name: str, body: ValidateRequest):
    try:
        input_safety.validate(body.llmOutput)
        return {"validation_passed": True}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
