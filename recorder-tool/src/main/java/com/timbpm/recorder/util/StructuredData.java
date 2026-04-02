package com.timbpm.recorder.util;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class StructuredData {
    private StructuredData() {
    }

    public static Object parseJson(String text) {
        return new JsonParser(text).parse();
    }

    public static String toJson(Object value) {
        StringBuilder builder = new StringBuilder();
        writeJson(builder, value, 0);
        return builder.toString();
    }

    public static Object parseYaml(String text) {
        return new YamlParser(text).parse();
    }

    public static String toYaml(Object value) {
        StringBuilder builder = new StringBuilder();
        writeYaml(builder, value, 0);
        return builder.toString();
    }

    private static void writeJson(StringBuilder builder, Object value, int depth) {
        if (value == null) {
            builder.append("null");
            return;
        }
        if (value instanceof String text) {
            builder.append('"').append(escape(text)).append('"');
            return;
        }
        if (value instanceof Number || value instanceof Boolean) {
            builder.append(value);
            return;
        }
        if (value instanceof Map<?, ?> map) {
            builder.append("{");
            boolean first = true;
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                if (!first) {
                    builder.append(",");
                }
                builder.append("\n");
                indent(builder, depth + 1);
                builder.append('"').append(escape(String.valueOf(entry.getKey()))).append('"').append(": ");
                writeJson(builder, entry.getValue(), depth + 1);
                first = false;
            }
            if (!map.isEmpty()) {
                builder.append("\n");
                indent(builder, depth);
            }
            builder.append("}");
            return;
        }
        if (value instanceof List<?> list) {
            builder.append("[");
            boolean first = true;
            for (Object item : list) {
                if (!first) {
                    builder.append(",");
                }
                builder.append("\n");
                indent(builder, depth + 1);
                writeJson(builder, item, depth + 1);
                first = false;
            }
            if (!list.isEmpty()) {
                builder.append("\n");
                indent(builder, depth);
            }
            builder.append("]");
            return;
        }
        builder.append('"').append(escape(String.valueOf(value))).append('"');
    }

    private static void writeYaml(StringBuilder builder, Object value, int depth) {
        if (value instanceof Map<?, ?> map) {
            for (Map.Entry<?, ?> entry : map.entrySet()) {
                indent(builder, depth);
                builder.append(String.valueOf(entry.getKey())).append(":");
                Object child = entry.getValue();
                if (isScalar(child)) {
                    builder.append(" ").append(renderYamlScalar(child)).append("\n");
                } else {
                    builder.append("\n");
                    writeYaml(builder, child, depth + 1);
                }
            }
            return;
        }
        if (value instanceof List<?> list) {
            for (Object item : list) {
                indent(builder, depth);
                builder.append("- ");
                if (isScalar(item)) {
                    builder.append(renderYamlScalar(item)).append("\n");
                } else {
                    builder.append("\n");
                    writeYaml(builder, item, depth + 1);
                }
            }
        }
    }

    private static boolean isScalar(Object value) {
        return value == null || value instanceof String || value instanceof Number || value instanceof Boolean;
    }

    private static String renderYamlScalar(Object value) {
        if (value == null) {
            return "null";
        }
        if (value instanceof Number || value instanceof Boolean) {
            return String.valueOf(value);
        }
        return "\"" + escape(String.valueOf(value)) + "\"";
    }

    private static String escape(String text) {
        return text
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\b", "\\b")
            .replace("\f", "\\f")
            .replace("\r", "\\r")
            .replace("\n", "\\n")
            .replace("\t", "\\t");
    }

    private static void indent(StringBuilder builder, int depth) {
        for (int index = 0; index < depth; index++) {
            builder.append("  ");
        }
    }

    private static final class JsonParser {
        private final String text;
        private int index;

        private JsonParser(String text) {
            this.text = Objects.requireNonNullElse(text, "");
        }

        private Object parse() {
            skipWhitespace();
            Object value = parseValue();
            skipWhitespace();
            if (index != text.length()) {
                throw new IllegalArgumentException("Unexpected trailing JSON at position " + index);
            }
            return value;
        }

        private Object parseValue() {
            skipWhitespace();
            if (index >= text.length()) {
                throw new IllegalArgumentException("Unexpected end of JSON");
            }
            char current = text.charAt(index);
            return switch (current) {
                case '{' -> parseObject();
                case '[' -> parseArray();
                case '"' -> parseString();
                case 't' -> parseLiteral("true", Boolean.TRUE);
                case 'f' -> parseLiteral("false", Boolean.FALSE);
                case 'n' -> parseLiteral("null", null);
                default -> {
                    if (current == '-' || Character.isDigit(current)) {
                        yield parseNumber();
                    }
                    throw new IllegalArgumentException("Unexpected JSON token '" + current + "' at position " + index);
                }
            };
        }

        private Map<String, Object> parseObject() {
            expect('{');
            Map<String, Object> result = new LinkedHashMap<>();
            skipWhitespace();
            if (peek('}')) {
                expect('}');
                return result;
            }
            while (true) {
                skipWhitespace();
                String key = parseString();
                skipWhitespace();
                expect(':');
                result.put(key, parseValue());
                skipWhitespace();
                if (peek('}')) {
                    expect('}');
                    return result;
                }
                expect(',');
            }
        }

        private List<Object> parseArray() {
            expect('[');
            List<Object> result = new ArrayList<>();
            skipWhitespace();
            if (peek(']')) {
                expect(']');
                return result;
            }
            while (true) {
                result.add(parseValue());
                skipWhitespace();
                if (peek(']')) {
                    expect(']');
                    return result;
                }
                expect(',');
            }
        }

        private String parseString() {
            expect('"');
            StringBuilder builder = new StringBuilder();
            while (index < text.length()) {
                char current = text.charAt(index++);
                if (current == '"') {
                    return builder.toString();
                }
                if (current == '\\') {
                    if (index >= text.length()) {
                        throw new IllegalArgumentException("Unterminated JSON escape sequence");
                    }
                    char escaped = text.charAt(index++);
                    switch (escaped) {
                        case '"', '\\', '/' -> builder.append(escaped);
                        case 'b' -> builder.append('\b');
                        case 'f' -> builder.append('\f');
                        case 'n' -> builder.append('\n');
                        case 'r' -> builder.append('\r');
                        case 't' -> builder.append('\t');
                        case 'u' -> builder.append(parseUnicodeEscape());
                        default -> throw new IllegalArgumentException("Unsupported JSON escape");
                    }
                } else {
                    builder.append(current);
                }
            }
            throw new IllegalArgumentException("Unterminated JSON string");
        }

        private Object parseNumber() {
            int start = index;
            if (text.charAt(index) == '-') {
                index++;
            }
            while (index < text.length() && Character.isDigit(text.charAt(index))) {
                index++;
            }
            boolean decimal = false;
            if (index < text.length() && text.charAt(index) == '.') {
                decimal = true;
                index++;
                while (index < text.length() && Character.isDigit(text.charAt(index))) {
                    index++;
                }
            }
            boolean exponent = false;
            if (index < text.length() && (text.charAt(index) == 'e' || text.charAt(index) == 'E')) {
                exponent = true;
                index++;
                if (index < text.length() && (text.charAt(index) == '+' || text.charAt(index) == '-')) {
                    index++;
                }
                int exponentStart = index;
                while (index < text.length() && Character.isDigit(text.charAt(index))) {
                    index++;
                }
                if (index == exponentStart) {
                    throw new IllegalArgumentException("Invalid JSON number exponent at position " + index);
                }
            }
            String numberText = text.substring(start, index);
            return decimal || exponent ? Double.parseDouble(numberText) : Long.parseLong(numberText);
        }

        private Object parseLiteral(String literal, Object value) {
            if (!text.startsWith(literal, index)) {
                throw new IllegalArgumentException("Expected '" + literal + "'");
            }
            index += literal.length();
            return value;
        }

        private void skipWhitespace() {
            while (index < text.length() && Character.isWhitespace(text.charAt(index))) {
                index++;
            }
        }

        private void expect(char expected) {
            if (index >= text.length() || text.charAt(index) != expected) {
                throw new IllegalArgumentException("Expected '" + expected + "' at position " + index);
            }
            index++;
        }

        private boolean peek(char expected) {
            return index < text.length() && text.charAt(index) == expected;
        }

        private char parseUnicodeEscape() {
            if (index + 4 > text.length()) {
                throw new IllegalArgumentException("Incomplete JSON unicode escape at position " + index);
            }
            String codePoint = text.substring(index, index + 4);
            for (int offset = 0; offset < codePoint.length(); offset++) {
                if (Character.digit(codePoint.charAt(offset), 16) < 0) {
                    throw new IllegalArgumentException("Invalid JSON unicode escape at position " + (index + offset));
                }
            }
            index += 4;
            return (char) Integer.parseInt(codePoint, 16);
        }
    }

    private static final class YamlParser {
        private final List<YamlLine> lines = new ArrayList<>();
        private int index;

        private YamlParser(String text) {
            String[] rawLines = Objects.requireNonNullElse(text, "").replace("\r", "").split("\n");
            for (String rawLine : rawLines) {
                String trimmed = rawLine.trim();
                if (trimmed.isEmpty() || trimmed.startsWith("#")) {
                    continue;
                }
                int indent = 0;
                while (indent < rawLine.length() && rawLine.charAt(indent) == ' ') {
                    indent++;
                }
                lines.add(new YamlLine(indent / 2, rawLine.substring(indent)));
            }
        }

        private Object parse() {
            if (lines.isEmpty()) {
                return new LinkedHashMap<String, Object>();
            }
            if (isListItem(lines.get(0).content)) {
                return parseList(lines.get(0).indent);
            }
            return parseMap(lines.get(0).indent);
        }

        private Map<String, Object> parseMap(int indent) {
            Map<String, Object> result = new LinkedHashMap<>();
            while (index < lines.size()) {
                YamlLine line = lines.get(index);
                if (line.indent < indent || isListItem(line.content)) {
                    break;
                }
                int separator = line.content.indexOf(':');
                if (separator < 0) {
                    throw new IllegalArgumentException("Invalid YAML line: " + line.content);
                }
                String key = line.content.substring(0, separator).trim();
                String remainder = line.content.substring(separator + 1).trim();
                index++;
                if (!remainder.isEmpty()) {
                    result.put(key, parseScalar(remainder));
                } else if (index < lines.size() && lines.get(index).indent > indent) {
                    if (isListItem(lines.get(index).content)) {
                        result.put(key, parseList(indent + 1));
                    } else {
                        result.put(key, parseMap(indent + 1));
                    }
                } else {
                    result.put(key, null);
                }
            }
            return result;
        }

        private List<Object> parseList(int indent) {
            List<Object> result = new ArrayList<>();
            while (index < lines.size()) {
                YamlLine line = lines.get(index);
                if (line.indent < indent || !isListItem(line.content)) {
                    break;
                }
                String remainder = listItemRemainder(line.content);
                index++;
                if (!remainder.isEmpty()) {
                    if (remainder.contains(":")) {
                        result.add(parseInlineMapItem(indent + 1, remainder));
                    } else {
                        result.add(parseScalar(remainder));
                    }
                } else if (index < lines.size() && lines.get(index).indent > indent) {
                    if (isListItem(lines.get(index).content)) {
                        result.add(parseList(indent + 1));
                    } else {
                        result.add(parseMap(indent + 1));
                    }
                } else {
                    result.add(null);
                }
            }
            return result;
        }

        private Map<String, Object> parseInlineMapItem(int indent, String content) {
            Map<String, Object> result = new LinkedHashMap<>();
            int separator = content.indexOf(':');
            if (separator < 0) {
                throw new IllegalArgumentException("Invalid YAML line: " + content);
            }

            String key = content.substring(0, separator).trim();
            String remainder = content.substring(separator + 1).trim();
            if (!remainder.isEmpty()) {
                result.put(key, parseScalar(remainder));
            } else if (index < lines.size() && lines.get(index).indent > indent - 1) {
                if (isListItem(lines.get(index).content)) {
                    result.put(key, parseList(indent));
                } else {
                    result.put(key, parseMap(indent));
                }
            } else {
                result.put(key, null);
            }

            if (index < lines.size() && lines.get(index).indent >= indent && !isListItem(lines.get(index).content)) {
                result.putAll(parseMap(indent));
            }

            return result;
        }

        private boolean isListItem(String content) {
            return "-".equals(content) || content.startsWith("- ");
        }

        private String listItemRemainder(String content) {
            if ("-".equals(content)) {
                return "";
            }
            return content.substring(2).trim();
        }

        private Object parseScalar(String text) {
            if ("null".equals(text)) {
                return null;
            }
            if ("true".equalsIgnoreCase(text) || "false".equalsIgnoreCase(text)) {
                return Boolean.parseBoolean(text);
            }
            if (text.startsWith("\"") && text.endsWith("\"")) {
                return text.substring(1, text.length() - 1)
                    .replace("\\n", "\n")
                    .replace("\\r", "\r")
                    .replace("\\t", "\t")
                    .replace("\\\"", "\"")
                    .replace("\\\\", "\\");
            }
            if (text.matches("-?\\d+")) {
                return Long.parseLong(text);
            }
            if (text.matches("-?\\d+\\.\\d+")) {
                return Double.parseDouble(text);
            }
            return text;
        }

        private static final class YamlLine {
            private final int indent;
            private final String content;

            private YamlLine(int indent, String content) {
                this.indent = indent;
                this.content = content;
            }
        }
    }
}
