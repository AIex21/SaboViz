# Use Maven with JDK 11
FROM maven:3.9-eclipse-temurin-11

WORKDIR /app

COPY maven_repository /app/maven_repository
COPY settings-offline.xml .

# Cache Maven Dependencies
COPY pom.xml .

# Copy Source Code
COPY src /app/src
COPY META-INF ./META-INF

# Build the Project
RUN mvn -o -s settings-offline.xml compile

# Create Mount Points for the external data
RUN mkdir -p /data/project \
    && mkdir -p /data/ext/msvc \
    && mkdir -p /data/ext/winkits \
    && mkdir -p /data/ext/vxworks \
    && mkdir -p /app/models

# Copy the config
COPY config.docker.json ./config.json

# Run
ENTRYPOINT ["mvn", "-o", "-s", "settings-offline.xml", "rascal:console"]