from airflow import DAG
from airflow.operators.empty import EmptyOperator
from datetime import datetime
with DAG(dag_id='test_stb_dag', start_date=datetime(2024,1,1), schedule_interval='@daily') as dag:
    start = EmptyOperator(task_id='start')