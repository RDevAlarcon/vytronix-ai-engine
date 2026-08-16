# Future server benchmark plan

This plan is documentation only. Nothing is executed on the server in Phase C.

Target context:

- 4 CPU;
- approximately 7 GiB RAM;
- Docker and other services already running;
- wait for a 30-day stability window before measurement.

Record for each provider/model and concurrency level 1 (optionally 2):

- CPU and load average;
- RAM and swap;
- temperature;
- request latency and errors;
- completion tokens and tokens/second;
- retries and schema/guardrail pass rate;
- cold-start versus warm inference.

Collect host data with system tools such as `docker stats`, `pidstat`, `free`
and `sensors`, without attributing host-wide measurements to the provider
without a clear sampling method. Avoid stress tests above two concurrent
requests until resource limits and operational impact are understood.
