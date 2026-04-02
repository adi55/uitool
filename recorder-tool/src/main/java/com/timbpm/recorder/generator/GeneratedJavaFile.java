package com.timbpm.recorder.generator;

import java.nio.file.Path;

public record GeneratedJavaFile(String className, String source, Path outputPath) {
}
