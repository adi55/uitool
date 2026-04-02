package com.timbpm.recorder.util;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class DataAccess {
    private DataAccess() {
    }

    @SuppressWarnings("unchecked")
    public static Map<String, Object> map(Object value) {
        if (value instanceof Map<?, ?> rawMap) {
            Map<String, Object> result = new LinkedHashMap<>();
            for (Map.Entry<?, ?> entry : rawMap.entrySet()) {
                result.put(String.valueOf(entry.getKey()), entry.getValue());
            }
            return result;
        }
        return Collections.emptyMap();
    }

    @SuppressWarnings("unchecked")
    public static List<Object> list(Object value) {
        if (value instanceof List<?>) {
            return (List<Object>) value;
        }
        return Collections.emptyList();
    }

    public static String string(Map<String, Object> source, String key, String defaultValue) {
        Object value = source.get(key);
        if (value == null) {
            return defaultValue;
        }
        return String.valueOf(value);
    }

    public static Integer integer(Map<String, Object> source, String key, Integer defaultValue) {
        Object value = source.get(key);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number number) {
            return number.intValue();
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            return defaultValue;
        }
        return Integer.parseInt(text);
    }

    public static Long longValue(Map<String, Object> source, String key, Long defaultValue) {
        Object value = source.get(key);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            return defaultValue;
        }
        return Long.parseLong(text);
    }

    public static Double doubleValue(Map<String, Object> source, String key, Double defaultValue) {
        Object value = source.get(key);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            return defaultValue;
        }
        return Double.parseDouble(text);
    }

    public static Boolean bool(Map<String, Object> source, String key, Boolean defaultValue) {
        Object value = source.get(key);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Boolean boolValue) {
            return boolValue;
        }
        String text = String.valueOf(value).trim();
        if (text.isEmpty()) {
            return defaultValue;
        }
        return Boolean.parseBoolean(text);
    }

    public static Map<String, Object> childMap(Map<String, Object> source, String key) {
        return map(source.get(key));
    }

    public static List<Map<String, Object>> listOfMaps(Map<String, Object> source, String key) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (Object item : list(source.get(key))) {
            result.add(map(item));
        }
        return result;
    }

    public static List<String> stringList(Map<String, Object> source, String key) {
        List<String> result = new ArrayList<>();
        for (Object item : list(source.get(key))) {
            result.add(String.valueOf(item));
        }
        return result;
    }
}
