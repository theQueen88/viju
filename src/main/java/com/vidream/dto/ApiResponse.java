package com.vidream.dto;

import java.util.Map;

public class ApiResponse {

    private boolean success;
    private String message;
    private Object data;

    public static ApiResponse ok(Object data) {
        ApiResponse r = new ApiResponse();
        r.success = true;
        r.data = data;
        return r;
    }

    public static ApiResponse ok(String message, Object data) {
        ApiResponse r = new ApiResponse();
        r.success = true;
        r.message = message;
        r.data = data;
        return r;
    }

    public static ApiResponse fail(String message) {
        ApiResponse r = new ApiResponse();
        r.success = false;
        r.message = message;
        return r;
    }

    public boolean isSuccess() { return success; }
    public void setSuccess(boolean success) { this.success = success; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public Object getData() { return data; }
    public void setData(Object data) { this.data = data; }
}
