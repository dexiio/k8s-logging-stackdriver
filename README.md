# k8s-logging-stackdriver
Small node application that reads logs from k8s and sends them to stackdriver in the same format as GKE. 

Useful for hybrid k8s deployments to have all logs be in 1 place. 

# Config
The logger is configured via environment variables to make it easier to configure using kubernetes. 
There is some hard-coded configuration for sources and targets within the application itself in the config.js file. 

## Logging
```
LOG_TO_FILE                     # If set the application will log to a file instead of std out. Should be enabled to avoid recursion in error logging.
FILE_EXCLUDE                    # If set excludes all files that contains the string. 
```

## Stackdriver variables
```
STACKDRIVER_RESOURCE_NAME       # The name of the logging pod itself. 
STACKDRIVER_CLUSTER             # The name of the cluster within Google Stack Driver.
STACKDRIVER_ZONE                # The name of the zone or region within Google Stack Driver.
```

## Google Cloud Platform access
```
GOOGLE_CLOUD_PROJECT            # The GCP project ID
GOOGLE_APPLICATION_CREDENTIALS  # Points to a service account json key which should be mounted in the  pod
```

## Kubernetes access
```
KUBERNETES_SERVICE_HOST         # The host for the kubernetes API - usually available within k8s clusters 
KUBERNETES_SERVICE_PORT         # The port for the kubernetes API - usually available within k8s clusters
```

# Kubernetes

The following YML file is an example of deploying this to an on-premise kubernetes cluster 

**stackdriver-logger-ds.yml**
```
kind: ConfigMap
apiVersion: v1
metadata:
  name: stackdriver-logger-auth-config
data:
  GCP-CREDENTIALS: |
    ... content of a google service account json key file ...
---
apiVersion: extensions/v1beta1
kind: DaemonSet
metadata:
  name: stackdriver-logger
spec:
  updateStrategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 100%
  template:
    spec:
      containers:
      - name: stackdriver-logger
        image: dexi/k8s-logging-stackdriver:latest
        imagePullPolicy: Always
        env:
        - name: FILE_EXCLUDE
          value: "stackdriver-logger"
        - name: GOOGLE_CLOUD_PROJECT
          value: my-google-project-id
        - name: GOOGLE_APPLICATION_CREDENTIALS
          value: /etc/gcp-credentials.json
        - name: STACKDRIVER_ZONE
          value: my-region-or-zone
        - name: STACKDRIVER_CLUSTER
          value: my-onpremise-cluster
        - name: STACKDRIVER_RESOURCE_NAME
          valueFrom:
            fieldRef:
              fieldPath: metadata.name
        volumeMounts:
        - name: varlog
          mountPath: /var/log
        - name: varlibdockercontainers
          mountPath: /var/lib/docker/containers
        - name: gcp-credentials
          mountPath: /etc/gcp-credentials.json
          subPath: gcp-credentials.json
      volumes:
      - name: varlog
        hostPath:
          path: /var/log
      - name: varlibdockercontainers
        hostPath:
          path: /var/lib/docker/containers
      - name: gcp-credentials
        configMap:
          name: stackdriver-logger-auth-config
          items:
          - key: GCP-CREDENTIALS
            path: gcp-credentials.json

```