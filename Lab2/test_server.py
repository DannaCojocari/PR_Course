import sys
import socket
import threading
import time

if len(sys.argv) < 4:
    print("Usage: python test_server.py <host> <single_thread_port> <multi_thread_port> [num_requests]")
    sys.exit(1)

HOST = sys.argv[1]
PORT_SINGLE = int(sys.argv[2])
PORT_MULTI = int(sys.argv[3])
NUM = int(sys.argv[4]) if len(sys.argv) >= 5 else 10

# FILE = "D:\PycharmProjects\PR_Course\Lab2\Materials\html_file\premium_room.png"
FILE = "D:\PycharmProjects\PR_Course\Lab2\Materials\cat.png"
REQUEST = f"GET {FILE} HTTP/1.1\r\nHost: {HOST}\r\nConnection: close\r\n\r\n"


def run_test(port, num_requests, rate=None):
    results = [None] * num_requests
    lock = threading.Lock()

    def worker(i):
        start = time.perf_counter()
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.connect((HOST, port))
                s.sendall(REQUEST.encode("utf-8"))
                data = b""
                while True:
                    chunk = s.recv(8192)
                    if not chunk:
                        break
                    data += chunk
            status_line = data.split(b"\r\n", 1)[0].decode()
            if status_line.startswith("HTTP/1.1 200"):
                status = "ok"
            elif status_line.startswith("HTTP/1.1 429"):
                status = "blocked"
            else:
                status = "error"
        except Exception as e:
            elapsed = time.perf_counter() - start
            with lock:
                results[i] = ("error", elapsed, str(e))
            return

        elapsed = time.perf_counter() - start
        with lock:
            # results[i] = (status, elapsed, len(data))   # for rate limiting test
            results[i] = ("ok", elapsed, len(data))  # for concurrency test

    threads = []
    t0 = time.perf_counter()
    for i in range(num_requests):
        t = threading.Thread(target=worker, args=(i,))
        t.start()
        threads.append(t)
        if rate is not None and rate > 0:
            time.sleep(1.0 / rate)

    for t in threads:
        t.join()
    total = time.perf_counter() - t0

    ok = sum(1 for r in results if r and r[0] == "ok")
    blocked = sum(1 for r in results if r and r[0] == "blocked")
    err = sum(1 for r in results if r and r[0] == "error")

    return total, ok, blocked, err



def main():
    print(f"Running test on single-threaded server (port {PORT_SINGLE})...")
    single_time, single_ok, single_block, single_err = run_test(PORT_SINGLE, NUM)
    print(f"Total time: {single_time:.3f} s, Successful: {single_ok}, Errors: {single_err}\n")

    print(f"Running test on multi-threaded server (port {PORT_MULTI})...")
    multi_time, multi_ok, multi_block, multi_err = run_test(PORT_MULTI, NUM)
    print(f"Total time: {multi_time:.3f} s, Successful: {multi_ok}, Errors: {multi_err}\n")

    print("=== Comparison ===")
    print(f"Single-threaded: {single_time:.3f}s")
    print(f"Multi-threaded : {multi_time:.3f}s")
    speedup = single_time / multi_time if multi_time > 0 else float('inf')
    print(f"Speedup: {speedup:.2f}x faster with multi-threading")

    spammer_rps = 10.0  # above RATE
    normal_rps = 4.0  # below RATE

    number = 50

    # print("\n\n=== Rate-limit Throughput Test ===")
    # print("\nRunning rate-limit throughput test (spammer)")
    # spam_time, spam_ok, spam_block, spam_err = run_test(PORT_MULTI, number, rate=spammer_rps)
    # print(
    #     f"Successful: {spam_ok}/{number}, Blocked: {spam_block}, Errors: {spam_err}, Throughput: {spam_ok / spam_time:.2f} req/sec")
    #
    # print("\nRunning rate-limit throughput test (normal)")
    # normal_time, normal_ok, normal_block, normal_err = run_test(PORT_MULTI, number, rate=normal_rps)
    # print(
    #     f"Successful: {normal_ok}/{number}, Blocked: {normal_block}, Errors: {normal_err}, Throughput: {normal_ok / normal_time:.2f} req/sec")



if __name__ == "__main__":
    main()
