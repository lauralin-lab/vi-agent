import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Card,
  Descriptions,
  Table,
  Tag,
  Button,
  Space,
  Typography,
  Spin,
  Popconfirm,
  message,
} from 'antd';
import client from '../api/client';
import UserLink from '../components/UserLink';

const { Title } = Typography;

export default function InviteCodeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [codeData, setCodeData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCode = async () => {
      setLoading(true);
      try {
        const res = await client.get(`/invite-codes/${id}`);
        setCodeData(res.data);
      } catch {
        message.error('\u52a0\u8f7d\u9080\u8bf7\u7801\u4fe1\u606f\u5931\u8d25');
      } finally {
        setLoading(false);
      }
    };
    fetchCode();
  }, [id]);

  const handleToggleStatus = async () => {
    try {
      const res = await client.patch(`/invite-codes/${id}/status`, {
        is_active: !codeData.is_active,
      });
      setCodeData((prev) => ({ ...prev, is_active: res.data.is_active }));
      message.success('\u72b6\u6001\u5df2\u66f4\u65b0');
    } catch {
      message.error('\u64cd\u4f5c\u5931\u8d25');
    }
  };

  if (loading) {
    return <Spin size="large" style={{ display: 'block', marginTop: 100 }} />;
  }

  if (!codeData) {
    return <Title level={4}>{'\u9080\u8bf7\u7801\u4e0d\u5b58\u5728'}</Title>;
  }

  const userColumns = [
    {
      title: '\u7528\u6237',
      key: 'user',
      render: (_, record) => (
        <UserLink userId={record.id} email={record.email} />
      ),
    },
    {
      title: '\u6ce8\u518c\u65f6\u95f4',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (t) => (t ? new Date(t).toLocaleString('zh-CN') : '-'),
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Button onClick={() => navigate(-1)}>{'\u2190 \u8fd4\u56de'}</Button>

      <Card>
        <Descriptions
          title={
            <Space>
              <Title level={4} style={{ margin: 0 }}>
                {'\u9080\u8bf7\u7801\u8be6\u60c5'}
              </Title>
              <Popconfirm
                title={
                  codeData.is_active
                    ? '\u786e\u8ba4\u7981\u7528\u8be5\u9080\u8bf7\u7801\uff1f'
                    : '\u786e\u8ba4\u542f\u7528\u8be5\u9080\u8bf7\u7801\uff1f'
                }
                onConfirm={handleToggleStatus}
              >
                <Button
                  type={codeData.is_active ? 'default' : 'primary'}
                  danger={codeData.is_active}
                  size="small"
                >
                  {codeData.is_active ? '\u7981\u7528' : '\u542f\u7528'}
                </Button>
              </Popconfirm>
            </Space>
          }
          column={2}
          bordered
        >
          <Descriptions.Item label={'\u9080\u8bf7\u7801'}>{codeData.code}</Descriptions.Item>
          <Descriptions.Item label="ID">{codeData.id}</Descriptions.Item>
          <Descriptions.Item label={'\u521b\u5efa\u8005'}>
            <UserLink userId={codeData.creator_id} email={codeData.creator_email} />
          </Descriptions.Item>
          <Descriptions.Item label={'\u72b6\u6001'}>
            <Tag color={codeData.is_active ? 'green' : 'default'}>
              {codeData.is_active ? '\u542f\u7528' : '\u7981\u7528'}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label={'\u5df2\u7528/\u4e0a\u9650'}>
            {codeData.used_count}/{codeData.max_uses ?? '\u221e'}
          </Descriptions.Item>
          <Descriptions.Item label={'\u8fc7\u671f\u65f6\u95f4'}>
            {codeData.expires_at
              ? new Date(codeData.expires_at).toLocaleString('zh-CN')
              : '\u6c38\u4e0d\u8fc7\u671f'}
          </Descriptions.Item>
          <Descriptions.Item label={'\u5907\u6ce8'}>{codeData.note || '-'}</Descriptions.Item>
          <Descriptions.Item label={'\u521b\u5efa\u65f6\u95f4'}>
            {codeData.created_at
              ? new Date(codeData.created_at).toLocaleString('zh-CN')
              : '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title={`\u4f7f\u7528\u6b64\u9080\u8bf7\u7801\u7684\u7528\u6237 (${codeData.users?.length || 0})`}>
        <Table
          columns={userColumns}
          dataSource={codeData.users || []}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Card>
    </Space>
  );
}
