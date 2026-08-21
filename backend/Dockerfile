FROM golang:1.27-alpine AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY *.go ./

RUN CGO_ENABLED=0 GOOS=linux go build -o /sunfall

FROM build AS test

RUN go test -v ./...

FROM gcr.io/distroless/static-debian12:nonroot AS prod

COPY --from=build /sunfall /sunfall

EXPOSE 8080

ENTRYPOINT ["/sunfall"]
